const express = require("express");
const router = express.Router();
const db = require("../config/db");
const validateId = require("../middleware/validateId");

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
            "SELECT * FROM Billing WHERE bill_id = ?",
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

        const [bookings] = await db.query(`
            SELECT
                b.booking_id,
                b.check_in,
                b.check_out,
                r.price_per_night
            FROM Booking b
            JOIN Room r ON b.room_id = r.room_id
            WHERE b.booking_id = ?
        `, [booking_id]);

        if (bookings.length === 0) {
            return res.status(404).json({ message: "Booking not found" });
        }

        const booking = bookings[0];

        // Normalize MySQL dates to calculate nights
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);

        const nights = Math.round(
            (checkOut - checkIn) / (1000 * 60 * 60 * 24)
        );

        const roomCharges = Number(booking.price_per_night) * nights;

        const [services] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) AS serviceCharges
            FROM Service_Order
            WHERE booking_id = ?
              AND order_status <> 'Cancelled'
        `, [booking_id]);

        const serviceCharges = Number(services[0].serviceCharges);

        const [existing] = await db.query(
            "SELECT bill_id FROM Billing WHERE booking_id = ?",
            [booking_id]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                message: "A bill already exists for this booking"
            });
        }

        const totalAmount = roomCharges + serviceCharges;

        const [result] = await db.query(`
            INSERT INTO Billing
            (booking_id, room_charges, service_charges, total_amount, payment_status)
            VALUES (?, ?, ?, ?, ?)
        `, [
            booking_id,
            roomCharges,
            serviceCharges,
            totalAmount,
            paymentStatus
        ]);

        res.status(201).json({
            message: "Bill generated successfully",
            bill_id: result.insertId,
            room_charges: roomCharges,
            service_charges: serviceCharges,
            total_amount: totalAmount
        });
    } catch (error) {
        console.error(error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "A bill already exists for this booking"
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