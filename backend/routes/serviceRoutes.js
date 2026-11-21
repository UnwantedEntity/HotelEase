const express = require("express");
const router = express.Router();
const db = require("../config/db");
const validateId = require("../middleware/validateId");

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
        }

        // The existing MySQL trigger handles service charges
        const [result] = await db.query(`
            INSERT INTO Service_Order
            (booking_id, staff_id, service_type, description, amount, order_status)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            booking_id,
            staff_id || null,
            service_type,
            description || null,
            amount,
            orderStatus
        ]);

        res.status(201).json({
            message: "Service order created successfully",
            order_id: result.insertId
        });
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
            `SELECT booking_id, amount, order_status
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

        if (
            order.order_status !== "Cancelled" &&
            order_status === "Cancelled"
        ) {
            await connection.query(`
                UPDATE Billing
                SET service_charges = GREATEST(0, service_charges - ?),
                    total_amount    = GREATEST(0, total_amount - ?)
                WHERE booking_id = ?
            `, [order.amount, order.amount, order.booking_id]);

        } else if (
            order.order_status === "Cancelled" &&
            order_status !== "Cancelled"
        ) {
            await connection.query(`
                UPDATE Billing
                SET service_charges = service_charges + ?,
                    total_amount    = total_amount + ?
                WHERE booking_id = ?
            `, [order.amount, order.amount, order.booking_id]);
        }

        await connection.query(
            "UPDATE Service_Order SET order_status = ? WHERE order_id = ?",
            [order_status, req.params.id]
        );

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
            `SELECT booking_id, amount, order_status
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

        // Reverse its charge from an existing bill
        if (order.order_status !== "Cancelled") {
            await connection.query(`
                UPDATE Billing
                SET service_charges = GREATEST(0, service_charges - ?),
                    total_amount    = GREATEST(0, total_amount - ?)
                WHERE booking_id = ?
            `, [order.amount, order.amount, order.booking_id]);
        }

        await connection.query(
            "DELETE FROM Service_Order WHERE order_id = ?",
            [req.params.id]
        );

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