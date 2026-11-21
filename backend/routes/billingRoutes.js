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

async function calculateBookingCharges(dbOrConnection, bookingId, chargeThroughDate) {
    const [bookings] = await dbOrConnection.query(`
        SELECT
            b.check_in,
            b.check_out,
            r.price_per_night
        FROM Booking b
        JOIN Room r ON b.room_id = r.room_id
        WHERE b.booking_id = ?
    `, [bookingId]);

    if (bookings.length === 0) {
        return null;
    }

    const booking = bookings[0];
    const millisecondsPerNight = 24 * 60 * 60 * 1000;
    const nights = Math.floor(
        (dateToUtcMillis(booking.check_out) - dateToUtcMillis(booking.check_in)) /
        millisecondsPerNight
    );

    if (nights <= 0) {
        throw new Error("Booking dates are invalid");
    }

    const chargeThrough = chargeThroughDate
        ? dateToUtcMillis(chargeThroughDate)
        : dateToUtcMillis(booking.check_out);
    const scheduledCheckOut = dateToUtcMillis(booking.check_out);
    const checkIn = dateToUtcMillis(booking.check_in);

    if (chargeThrough < checkIn) {
        throw new Error("Charge-through date cannot be before check-in");
    }

    const chargedNights = Math.floor(
        (chargeThrough - checkIn) / millisecondsPerNight
    );
    const extraNights = Math.max(
        0,
        Math.floor((chargeThrough - scheduledCheckOut) / millisecondsPerNight)
    );
    const pricePerNight = toCurrency(booking.price_per_night);
    const roomCharges = toCurrency(pricePerNight * chargedNights);
    const extraStayCharges = toCurrency(pricePerNight * extraNights);

    const [services] = await dbOrConnection.query(`
        SELECT COALESCE(SUM(amount), 0) AS serviceCharges
        FROM Service_Order
        WHERE booking_id = ?
          AND order_status <> 'Cancelled'
    `, [bookingId]);

    const serviceCharges = toCurrency(services[0].serviceCharges);

    return {
        roomCharges,
        serviceCharges,
        extraStayCharges,
        chargeThroughDate: chargeThroughDate || String(booking.check_out).slice(0, 10),
        totalAmount: toCurrency(roomCharges + serviceCharges)
    };
}

// GET all bills
router.get("/", async (req, res) => {
    try {
        const [bills] = await db.query(`
            SELECT
                bi.*,
                b.guest_id,
                g.full_name AS guest_name,
                b.room_id,
                r.room_number,
                GREATEST(DATEDIFF(COALESCE(bi.charge_through_date, b.check_out), b.check_in) * r.price_per_night, 0)
                    AS calculated_room_charges,
                GREATEST(DATEDIFF(COALESCE(bi.charge_through_date, b.check_out), b.check_out), 0)
                    * r.price_per_night AS calculated_extra_stay_charges,
                COALESCE((
                    SELECT SUM(so.amount)
                    FROM Service_Order so
                    WHERE so.booking_id = b.booking_id
                      AND so.order_status <> 'Cancelled'
                ), 0) AS calculated_service_charges,
                GREATEST(DATEDIFF(COALESCE(bi.charge_through_date, b.check_out), b.check_in) * r.price_per_night, 0)
                + COALESCE((
                    SELECT SUM(so.amount)
                    FROM Service_Order so
                    WHERE so.booking_id = b.booking_id
                      AND so.order_status <> 'Cancelled'
                ), 0) AS calculated_total_amount,
                b.check_in,
                b.check_out
            FROM Billing bi
            JOIN Booking b ON bi.booking_id = b.booking_id
            JOIN Guest g ON b.guest_id = g.guest_id
            JOIN Room r ON b.room_id = r.room_id
            ORDER BY bi.bill_id DESC
        `);

        res.json(bills);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch bills" });
    }
});

// GET bill by ID
router.get("/:id", validateId, async (req, res) => {
    try {
        const [bills] = await db.query(
            `SELECT
                bi.*,
                b.guest_id,
                g.full_name AS guest_name,
                b.room_id,
                r.room_number,
                GREATEST(DATEDIFF(COALESCE(bi.charge_through_date, b.check_out), b.check_in) * r.price_per_night, 0)
                    AS calculated_room_charges,
                GREATEST(DATEDIFF(COALESCE(bi.charge_through_date, b.check_out), b.check_out), 0)
                    * r.price_per_night AS calculated_extra_stay_charges,
                COALESCE((
                    SELECT SUM(so.amount)
                    FROM Service_Order so
                    WHERE so.booking_id = b.booking_id
                      AND so.order_status <> 'Cancelled'
                ), 0) AS calculated_service_charges,
                GREATEST(DATEDIFF(COALESCE(bi.charge_through_date, b.check_out), b.check_in) * r.price_per_night, 0)
                + COALESCE((
                    SELECT SUM(so.amount)
                    FROM Service_Order so
                    WHERE so.booking_id = b.booking_id
                      AND so.order_status <> 'Cancelled'
                ), 0) AS calculated_total_amount,
                b.check_in,
                b.check_out
             FROM Billing bi
             JOIN Booking b ON bi.booking_id = b.booking_id
             JOIN Guest g ON b.guest_id = g.guest_id
             JOIN Room r ON b.room_id = r.room_id
             WHERE bi.bill_id = ?`,
            [req.params.id]
        );

        if (bills.length === 0) {
            return res.status(404).json({ message: "Bill not found" });
        }

        res.json(bills[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch bill" });
    }
});

// POST generate bill
router.post("/", async (req, res) => {
    try {
        const { booking_id } = req.body;
        const paymentStatus = req.body.payment_status || "Pending";
        const chargeThroughDate = req.body.charge_through_date
            ? String(req.body.charge_through_date).slice(0, 10)
            : null;

        if (!["Pending", "Paid", "Partially Paid", "Refunded"].includes(paymentStatus)) {
            return res.status(400).json({
                message: "Invalid payment status"
            });
        }

        if (!Number.isInteger(Number(booking_id)) || Number(booking_id) <= 0) {
            return res.status(400).json({
                message: "A valid booking ID is required"
            });
        }
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [existing] = await connection.query(
                "SELECT bill_id FROM Billing WHERE booking_id = ? FOR UPDATE",
                [booking_id]
            );

            if (existing.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    message: "A bill already exists for this booking"
                });
            }

            const charges = await calculateBookingCharges(
                connection,
                booking_id,
                chargeThroughDate
            );

            if (!charges) {
                await connection.rollback();
                return res.status(404).json({ message: "Booking not found" });
            }

            const [result] = await connection.query(`
                INSERT INTO Billing
                (booking_id, room_charges, service_charges, total_amount, charge_through_date, payment_status)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                booking_id,
                charges.roomCharges,
                charges.serviceCharges,
                charges.totalAmount,
                charges.chargeThroughDate,
                paymentStatus
            ]);

            await connection.commit();

            res.status(201).json({
                message: "Bill generated successfully",
                bill_id: result.insertId,
                room_charges: charges.roomCharges,
                service_charges: charges.serviceCharges,
                extra_stay_charges: charges.extraStayCharges,
                charge_through_date: charges.chargeThroughDate,
                total_amount: charges.totalAmount
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error(error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "A bill already exists for this booking"
            });
        }

        if (error.message === "Booking dates are invalid") {
            return res.status(400).json({
                message: "The booking dates are invalid"
            });
        }

        if (error.message === "Charge-through date cannot be before check-in") {
            return res.status(400).json({
                message: "Charge-through date cannot be before check-in"
            });
        }

        res.status(500).json({ message: "Failed to generate bill" });
    }
});

// PATCH payment status
router.patch("/:id/payment", validateId, async (req, res) => {
    try {
        const { payment_status } = req.body;

        const allowedStatuses = [
            "Pending",
            "Paid",
            "Partially Paid",
            "Refunded"
        ];

        if (!allowedStatuses.includes(payment_status)) {
            return res.status(400).json({
                message: "Invalid payment status"
            });
        }

        const [result] = await db.query(
            "UPDATE Billing SET payment_status = ? WHERE bill_id = ?",
            [payment_status, req.params.id]
            );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Bill not found" });
        }

        res.json({
            message: "Payment status updated successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to update payment status"
        });
    }
});

module.exports = router;