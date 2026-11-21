const express = require("express");
const router = express.Router();
const db = require("../config/db");
const validateId = require("../middleware/validateId");

// GET all staff
router.get("/", async (req, res) => {
    try {
        const [staff] = await db.query(
            "SELECT * FROM Service_Staff ORDER BY staff_id DESC"
        );

        res.json(staff);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch staff" });
    }
});

// GET staff by ID
router.get("/:id", validateId, async (req, res) => {
    try {
        const [staff] = await db.query(
            "SELECT * FROM Service_Staff WHERE staff_id = ?",
            [req.params.id]
        );

        if (staff.length === 0) {
            return res.status(404).json({
                message: "Staff member not found"
            });
        }

        res.json(staff[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch staff member"
        });
    }
});

// POST add staff
router.post("/", async (req, res) => {
    try {
        const { full_name, role, phone, availability } = req.body;

        if (!full_name || !role || !phone) {
            return res.status(400).json({
                message: "Name, role and phone are required"
            });
        }

        const allowedAvailability = [
            "Available",
            "Busy",
            "On Leave"
        ];

        const staffAvailability = availability || "Available";

        if (!allowedAvailability.includes(staffAvailability)) {
            return res.status(400).json({
                message: "Invalid staff availability"
            });
        }

        const [result] = await db.query(`
            INSERT INTO Service_Staff
            (full_name, role, phone, availability)
            VALUES (?, ?, ?, ?)
        `, [full_name, role, phone, staffAvailability]);

        res.status(201).json({
            message: "Staff member added successfully",
            staff_id: result.insertId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to add staff member"
        });
    }
});

// PUT update staff
router.put("/:id", validateId, async (req, res) => {
    try {
        const { full_name, role, phone, availability } = req.body;

        if (!full_name || !role || !phone || !availability) {
            return res.status(400).json({
                message: "All staff fields are required"
            });
        }

        const allowedAvailability = [
            "Available",
            "Busy",
            "On Leave"
        ];

        if (!allowedAvailability.includes(availability)) {
            return res.status(400).json({
                message: "Invalid staff availability"
            });
        }

        const [result] = await db.query(`
            UPDATE Service_Staff
            SET full_name = ?, role = ?, phone = ?, availability = ?
            WHERE staff_id = ?
        `, [
            full_name,
            role,
            phone,
            availability,
            req.params.id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Staff member not found"
            });
        }

        res.json({
            message: "Staff member updated successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to update staff member"
        });
    }
});

// DELETE staff
router.delete("/:id", validateId, async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM Service_Staff WHERE staff_id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Staff member not found"
            });
        }

        res.json({
            message: "Staff member deleted successfully"
        });
    } catch (error) {
        console.error(error);

        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                message: "Cannot delete staff member because service orders are assigned to them"
            });
        }

        res.status(500).json({
            message: "Failed to delete staff member"
        });
    }
});

module.exports = router;