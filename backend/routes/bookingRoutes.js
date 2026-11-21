const express = require("express");
const router = express.Router();
const db = require("../config/db");
const validateId = require("../middleware/validateId");

// GET all bookings
router.get("/", async (req, res) => {
    try {
        const [bookings] = await db.query(`
            SELECT
                b.*,
                g.full_name AS guest_name,
                r.room_number,
                r.room_type,
                r.price_per_night
            FROM Booking b
            JOIN Guest g ON b.guest_id = g.guest_id
            JOIN Room r ON b.room_id = r.room_id
            ORDER BY b.booking_id DESC
        `);

        res.json(bookings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch bookings" });
    }
});

// POST create booking
router.post("/", async (req, res) => {
    const { guest_id, room_id, check_in, check_out } = req.body;
    const bookingStatus = req.body.booking_status || "Confirmed";

    if (!["Confirmed", "Checked-In", "Checked-Out"].includes(bookingStatus)) {
        return res.status(400).json({
            message: "Invalid booking status"
        });
    }

    if (!guest_id || !room_id || !check_in || !check_out) {
        return res.status(400).json({
            message: "Guest, room, check-in and check-out are required"
        });
    }

    const start = new Date(check_in);
    const end = new Date(check_out);

    if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
    ) {
        return res.status(400).json({
            message: "Check-out must be later than check-in"
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Lock room to prevent concurrent booking conflicts
        const [rooms] = await connection.query(
            "SELECT room_id, status FROM Room WHERE room_id = ? FOR UPDATE",
            [room_id]
        );

        if (rooms.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Room not found" });
        }

        if (["Maintenance", "Out of Service"].includes(rooms[0].status)) {
            await connection.rollback();
            return res.status(409).json({
                message: `Room is not available (${rooms[0].status})`
            });
        }

        const [guests] = await connection.query(
            "SELECT guest_id FROM Guest WHERE guest_id = ?",
            [guest_id]
        );

        if (guests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Guest not found" });
        }

        // Prevent overlapping bookings for the same room
        const [conflicts] = await connection.query(
            `SELECT booking_id
             FROM Booking
             WHERE room_id = ?
               AND booking_status <> 'Cancelled'
               AND check_in < ?
               AND check_out > ?
             LIMIT 1`,
            [room_id, check_out, check_in]
        );

        if (conflicts.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                message: "Room is already booked for these dates"
            });
        }

        const [result] = await connection.query(
            `INSERT INTO Booking
             (guest_id, room_id, check_in, check_out, booking_status)
             VALUES (?, ?, ?, ?, ?)`,
            [guest_id, room_id, check_in, check_out, bookingStatus]
        );

        // A booking created already checked-in occupies the room
        if (bookingStatus === "Checked-In") {
            await connection.query(
                "UPDATE Room SET status = 'Occupied' WHERE room_id = ?",
                [room_id]
            );
        }

        await connection.commit();

        res.status(201).json({
            message: "Booking created successfully",
            booking_id: result.insertId
        });
    } catch (error) {
        if (connection) await connection.rollback();

        console.error(error);
        res.status(500).json({ message: "Failed to create booking" });
    } finally {
        if (connection) connection.release();
    }
});

// PATCH booking status
router.patch("/:id/status", validateId, async (req, res) => {
    const { booking_status } = req.body;

    const allowedStatuses = [
        "Confirmed",
        "Checked-In",
        "Checked-Out",
        "Cancelled"
    ];

    if (!allowedStatuses.includes(booking_status)) {
        return res.status(400).json({
            message: "Invalid booking status"
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [bookings] = await connection.query(
            `SELECT room_id, booking_status
             FROM Booking
             WHERE booking_id = ?
             FOR UPDATE`,
            [req.params.id]
        );

        if (bookings.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Booking not found" });
        }

        const roomId = bookings[0].room_id;
        const current = bookings[0].booking_status;

        // Allowed status transitions
        const transitions = {
            "Confirmed": ["Checked-In", "Cancelled"],
            "Checked-In": ["Checked-Out", "Cancelled"],
            "Checked-Out": [],
            "Cancelled": []
        };

        if (!(transitions[current] || []).includes(booking_status)) {
            await connection.rollback();
            return res.status(409).json({
                message: `Cannot change a ${current} booking to ${booking_status}`
            });
        }

        if (booking_status === "Checked-In") {
            const [rooms] = await connection.query(
                "SELECT status FROM Room WHERE room_id = ? FOR UPDATE",
                [roomId]
            );

            if (rooms.length === 0 || rooms[0].status !== "Available") {
                await connection.rollback();
                return res.status(409).json({
                    message: "This room is not currently available"
                });
            }
        }

        await connection.query(
            "UPDATE Booking SET booking_status = ? WHERE booking_id = ?",
            [booking_status, req.params.id]
        );

        if (booking_status === "Checked-In") {
            await connection.query(
                "UPDATE Room SET status = 'Occupied' WHERE room_id = ?",
                [roomId]
            );
        } else if (current === "Checked-In") {
            // Only a guest who was actually in the room frees it up.
            // (Cancelling a future booking must not free an occupied room.)
            await connection.query(
                "UPDATE Room SET status = 'Available' WHERE room_id = ?",
                [roomId]
            );
        }

        await connection.commit();

        res.json({
            message: "Booking status updated successfully"
        });
    } catch (error) {
        if (connection) await connection.rollback();

        console.error(error);
        res.status(500).json({
            message: "Failed to update booking status"
        });
    } finally {
        if (connection) connection.release();
    }
});

// DELETE booking
router.delete("/:id", validateId, async (req, res) => {
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [bookings] = await connection.query(
            `SELECT room_id, booking_status
             FROM Booking
             WHERE booking_id = ?
             FOR UPDATE`,
            [req.params.id]
        );

        if (bookings.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Booking not found" });
        }

        const [bills] = await connection.query(
            "SELECT bill_id FROM Billing WHERE booking_id = ? LIMIT 1",
            [req.params.id]
        );

        if (bills.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                message: "This booking has a bill. It cannot be deleted."
            });
        }

        const [orders] = await connection.query(
            "SELECT order_id FROM Service_Order WHERE booking_id = ? LIMIT 1",
            [req.params.id]
        );

        if (orders.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                message: "This booking has service orders. Delete them first."
            });
        }

        await connection.query(
            "DELETE FROM Booking WHERE booking_id = ?",
            [req.params.id]
        );

        // Deleting a checked-in booking frees its room
        if (bookings[0].booking_status === "Checked-In") {
            await connection.query(
                "UPDATE Room SET status = 'Available' WHERE room_id = ?",
                [bookings[0].room_id]
            );
        }

        await connection.commit();

        res.json({ message: "Booking deleted successfully" });
    } catch (error) {
        if (connection) await connection.rollback();

        console.error(error);
        res.status(500).json({ message: "Failed to delete booking" });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;