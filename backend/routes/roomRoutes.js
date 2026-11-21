const express = require("express");
const router = express.Router();
const db = require("../config/db");
const validateId = require("../middleware/validateId");

// GET all rooms
router.get("/", async (req, res) => {
    try {
        const [rooms] = await db.query(
            "SELECT * FROM Room ORDER BY room_id"
        );
        res.json(rooms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch rooms" });
    }
});

// GET room by ID
router.get("/:id", validateId, async (req, res) => {
    try {
        const [rooms] = await db.query(
            "SELECT * FROM Room WHERE room_id = ?",
            [req.params.id]
        );

        if (rooms.length === 0) {
            return res.status(404).json({ message: "Room not found" });
        }

        res.json(rooms[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch room" });
    }
});

// POST new room
router.post("/", async (req, res) => {
    try {
        const { room_number, room_type, price_per_night, status } = req.body;

        if (!room_number || !room_type || price_per_night == null) {
            return res.status(400).json({
                message: "Room number, room type and price are required"
            });
        }

        if (
            !Number.isFinite(Number(price_per_night)) ||
            Number(price_per_night) <= 0
        ) {
            return res.status(400).json({
                message: "Price must be greater than zero"
            });
        }

        const allowedStatuses = [
            "Available",
            "Occupied",
            "Maintenance",
            "Out of Service"
        ];

        const roomStatus = status || "Available";

        if (!allowedStatuses.includes(roomStatus)) {
            return res.status(400).json({
                message: "Invalid room status"
            });
        }

        const [result] = await db.query(
            `INSERT INTO Room
             (room_number, room_type, price_per_night, status)
             VALUES (?, ?, ?, ?)`,
            [room_number, room_type, price_per_night, roomStatus]
        );

        res.status(201).json({
            message: "Room added successfully",
            room_id: result.insertId
        });
    } catch (error) {
        console.error(error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Room number already exists"
            });
        }

        res.status(500).json({ message: "Failed to add room" });
    }
});

// PUT update room
router.put("/:id", validateId, async (req, res) => {
    try {
        const { room_number, room_type, price_per_night, status } = req.body;

        if (!room_number || !room_type || price_per_night == null || !status) {
            return res.status(400).json({
                message: "All room fields are required"
            });
        }

        if (
            !Number.isFinite(Number(price_per_night)) ||
            Number(price_per_night) <= 0
        ) {
            return res.status(400).json({
                message: "Price must be greater than zero"
            });
        }

        const allowedStatuses = [
            "Available",
            "Occupied",
            "Maintenance",
            "Out of Service"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                message: "Invalid room status"
            });
        }

        const [result] = await db.query(
            `UPDATE Room
             SET room_number = ?, room_type = ?,
                 price_per_night = ?, status = ?
             WHERE room_id = ?`,
            [room_number, room_type, price_per_night, status, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Room not found" });
        }

        res.json({ message: "Room updated successfully" });
    } catch (error) {
        console.error(error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Room number already exists"
            });
        }

        res.status(500).json({ message: "Failed to update room" });
    }
});

// DELETE room
router.delete("/:id", validateId, async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM Room WHERE room_id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Room not found" });
        }

        res.json({ message: "Room deleted successfully" });
    } catch (error) {
        console.error(error);

        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                message: "Cannot delete room because booking records exist"
            });
        }

        res.status(500).json({ message: "Failed to delete room" });
    }
});

module.exports = router;