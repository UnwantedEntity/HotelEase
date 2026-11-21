const express = require("express");
const router = express.Router();
const db = require("../config/db");
const validateId = require("../middleware/validateId");

// GET all guests
router.get("/", async (req, res) => {
    try {
        const [guests] = await db.query(
            "SELECT * FROM Guest ORDER BY guest_id DESC"
        );
        res.json(guests);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch guests" });
    }
});

// GET guest by ID
router.get("/:id", validateId, async (req, res) => {
    try {
        const [guests] = await db.query(
            "SELECT * FROM Guest WHERE guest_id = ?",
            [req.params.id]
        );

        if (guests.length === 0) {
            return res.status(404).json({ message: "Guest not found" });
        }

        res.json(guests[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch guest" });
    }
});

// POST new guest
router.post("/", async (req, res) => {
    try {
        const { full_name, email, phone, address } = req.body;

        if (!full_name || !phone) {
            return res.status(400).json({
                message: "Name and phone are required"
            });
        }

        const [result] = await db.query(
            `INSERT INTO Guest (full_name, email, phone, address)
             VALUES (?, ?, ?, ?)`,
            [full_name, email || null, phone, address || null]
            );

        res.status(201).json({
            message: "Guest added successfully",
            guest_id: result.insertId
        });
    } catch (error) {
        console.error(error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Email already exists"
            });
        }

        res.status(500).json({ message: "Failed to add guest" });
    }
});

// PUT update guest
router.put("/:id", validateId, async (req, res) => {
    try {
        const { full_name, email, phone, address } = req.body;

        if (!full_name || !phone) {
            return res.status(400).json({
                message: "Name and phone are required"
            });
        }

        const [result] = await db.query(
            `UPDATE Guest
             SET full_name = ?, email = ?, phone = ?, address = ?
             WHERE guest_id = ?`,
            [full_name, email || null, phone, address || null, req.params.id]
            );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Guest not found" });
        }

        res.json({ message: "Guest updated successfully" });
    } catch (error) {
        console.error(error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Email already exists"
            });
        }

        res.status(500).json({ message: "Failed to update guest" });
    }
});

// DELETE guest
router.delete("/:id", validateId, async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM Guest WHERE guest_id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Guest not found" });
        }

        res.json({ message: "Guest deleted successfully" });
    } catch (error) {
        console.error(error);

        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                message: "Cannot delete guest because booking records exist"
            });
        }

        res.status(500).json({ message: "Failed to delete guest" });
    }
});

module.exports = router;