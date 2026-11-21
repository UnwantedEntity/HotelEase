const express = require("express");
const router = express.Router();
const db = require("../config/db");
const validateId = require("../middleware/validateId");

const toCurrency = value => {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;
};

const dateToUtcMillis = value => {
    const date = String(value).slice(0, 10);
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
};

async function syncStaffAvailability(connection, staffId) {
    if (!staffId) return;

    const [staffRows] = await connection.query(
        "SELECT availability FROM Service_Staff WHERE staff_id = ? FOR UPDATE",
        [staffId]
    );

    if (staffRows.length === 0) return;

    const [counts] = await connection.query(`
        SELECT COUNT(*) AS activeTasks
        FROM Service_Order
        WHERE staff_id = ?
          AND order_status IN ('Pending', 'In Progress')
    `, [staffId]);

    const activeTasks = Number(counts[0].activeTasks);
    const availability = staffRows[0].availability;

    if (availability !== "On Leave") {
        await connection.query(
            "UPDATE Service_Staff SET availability = ? WHERE staff_id = ?",
            [activeTasks >= 10 ? "Busy" : "Available", staffId]
        );
    }
}

async function recalculateBilling(connection, bookingId) {
    const [bookings] = await connection.query(`
        SELECT
            b.check_in,
            b.check_out,
            r.price_per_night,
            bi.charge_through_date
        FROM Booking b
        JOIN Room r ON b.room_id = r.room_id
        LEFT JOIN Billing bi ON bi.booking_id = b.booking_id
        WHERE b.booking_id = ?
    `, [bookingId]);

    if (bookings.length === 0) return;

    const booking = bookings[0];
    const millisecondsPerNight = 24 * 60 * 60 * 1000;
    const chargeThrough = dateToUtcMillis(
        booking.charge_through_date || booking.check_out
    );
    const checkIn = dateToUtcMillis(booking.check_in);
    const nights = Math.floor(
        (chargeThrough - checkIn) /
        millisecondsPerNight
    );

    if (nights <= 0) {
        throw new Error("Booking dates are invalid");
    }

    const roomCharges = toCurrency(toCurrency(booking.price_per_night) * nights);
    const [services] = await connection.query(`
        SELECT COALESCE(SUM(amount), 0) AS serviceCharges
        FROM Service_Order
        WHERE booking_id = ?
          AND order_status <> 'Cancelled'
    `, [bookingId]);
    const serviceCharges = toCurrency(services[0].serviceCharges);

    await connection.query(`
        UPDATE Billing
        SET room_charges = ?,
            service_charges = ?,
            total_amount = ?
        WHERE booking_id = ?
    `, [
        roomCharges,
        serviceCharges,
        toCurrency(roomCharges + serviceCharges),
        bookingId
    ]);
}

// GET all service orders
router.get("/", async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT
                so.*,
                g.full_name AS guest_name,
                r.room_number,
                ss.full_name AS staff_name
            FROM Service_Order so
            JOIN Booking b ON so.booking_id = b.booking_id
            JOIN Guest g ON b.guest_id = g.guest_id
            JOIN Room r ON b.room_id = r.room_id
            LEFT JOIN Service_Staff ss ON so.staff_id = ss.staff_id
            ORDER BY so.order_id DESC
        `);

        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch service orders" });
    }
});

// POST create service order
router.post("/", async (req, res) => {
    try {
        const {
            booking_id,
            staff_id,
            service_type,
            description,
            amount
        } = req.body;

        const orderStatus = req.body.order_status || "Pending";

        if (!["Pending", "In Progress", "Completed", "Cancelled"].includes(orderStatus)) {
            return res.status(400).json({
                message: "Invalid service order status"
            });
        }

        const allowedTypes = [
            "Dining",
            "Laundry",
            "Housekeeping",
            "Room Service"
        ];

        if (!booking_id || !service_type || amount == null) {
            return res.status(400).json({
                message: "Booking, service type and amount are required"
            });
        }

        if (!allowedTypes.includes(service_type)) {
            return res.status(400).json({
                message: "Invalid service type"
            });
        }

        if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
            return res.status(400).json({
                message: "Amount must be zero or greater"
            });
        }

        const [bookings] = await db.query(
            "SELECT booking_id FROM Booking WHERE booking_id = ?",
            [booking_id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ message: "Booking not found" });
        }

        if (staff_id != null) {
            const [staff] = await db.query(
                "SELECT staff_id, availability FROM Service_Staff WHERE staff_id = ?",
                [staff_id]
            );

            if (staff.length === 0) {
                return res.status(404).json({
                    message: "Staff member not found"
                });
            }

            if (staff[0].availability !== "Available") {
                return res.status(409).json({
                    message: "Selected staff member is not available"
                });
            }

            const [taskCounts] = await db.query(`
                SELECT COUNT(*) AS activeTasks
                FROM Service_Order
                WHERE staff_id = ?
                  AND order_status IN ('Pending', 'In Progress')
            `, [staff_id]);

            if (Number(taskCounts[0].activeTasks) >= 10) {
                await db.query(
                    "UPDATE Service_Staff SET availability = 'Busy' WHERE staff_id = ?",
                    [staff_id]
                );
                return res.status(409).json({
                    message: "This staff member already has 10 active tasks"
                });
            }
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [result] = await connection.query(`
                INSERT INTO Service_Order
                (booking_id, staff_id, service_type, description, amount, order_status)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                booking_id,
                staff_id || null,
                service_type,
                description || null,
                Number(amount).toFixed(2),
                orderStatus
            ]);

            await recalculateBilling(connection, booking_id);
            await syncStaffAvailability(connection, staff_id);
            await connection.commit();

            res.status(201).json({
                message: "Service order created successfully",
                order_id: result.insertId
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to create service order"
        });
    }
});

// PATCH update service order status
router.patch("/:id/status", validateId, async (req, res) => {
    const { order_status } = req.body;

    const allowedStatuses = [
        "Pending",
        "In Progress",
        "Completed",
        "Cancelled"
    ];

    if (!allowedStatuses.includes(order_status)) {
        return res.status(400).json({
            message: "Invalid service order status"
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [orders] = await connection.query(
            `SELECT booking_id, staff_id, amount, order_status
             FROM Service_Order
             WHERE order_id = ?
             FOR UPDATE`,
            [req.params.id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: "Service order not found"
            });
        }

        const order = orders[0];

        await connection.query(
            "UPDATE Service_Order SET order_status = ? WHERE order_id = ?",
            [order_status, req.params.id]
        );

        await recalculateBilling(connection, order.booking_id);
        await syncStaffAvailability(connection, order.staff_id);

        await connection.commit();

        res.json({
            message: "Service order status updated successfully"
        });
    } catch (error) {
        if (connection) await connection.rollback();

        console.error(error);
        res.status(500).json({
            message: "Failed to update service order status"
        });
    } finally {
        if (connection) connection.release();
    }
});

// DELETE service order
router.delete("/:id", validateId, async (req, res) => {
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [orders] = await connection.query(
            `SELECT booking_id, staff_id, amount, order_status
             FROM Service_Order
             WHERE order_id = ?
             FOR UPDATE`,
            [req.params.id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: "Service order not found"
            });
        }

        const order = orders[0];

        await connection.query(
            "DELETE FROM Service_Order WHERE order_id = ?",
            [req.params.id]
        );

        await recalculateBilling(connection, order.booking_id);
        await syncStaffAvailability(connection, order.staff_id);

        await connection.commit();

        res.json({ message: "Service order deleted successfully" });
    } catch (error) {
        if (connection) await connection.rollback();

        console.error(error);
        res.status(500).json({
            message: "Failed to delete service order"
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;