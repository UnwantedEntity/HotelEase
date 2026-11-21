const express = require("express");
const router = express.Router();
const db = require("../config/db");
const validateId = require("../middleware/validateId");

// GET all staff
router.get("/", async (req, res) => {
    try {
        const [staff] = await db.query(
            `SELECT
                ss.staff_id,
                ss.full_name,
                ss.role,
                ss.phone,
                CASE
                    WHEN ss.availability = 'On Leave' THEN 'On Leave'
                    WHEN (SELECT COUNT(*)
                          FROM Service_Order so
                          WHERE so.staff_id = ss.staff_id
                            AND so.order_status IN ('Pending', 'In Progress')
                    ) >= 10 THEN 'Busy'
                    ELSE 'Available'
                END AS availability,
                (SELECT COUNT(*)
                 FROM Service_Order so
                 WHERE so.staff_id = ss.staff_id
                   AND so.order_status IN ('Pending', 'In Progress')
                ) AS active_task_count
             FROM Service_Staff ss
             ORDER BY ss.staff_id DESC`
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

        let finalAvailability = availability;
        if (availability !== "On Leave") {
            const [counts] = await db.query(`
                SELECT COUNT(*) AS activeTasks
                FROM Service_Order
                WHERE staff_id = ?
                  AND order_status IN ('Pending', 'In Progress')
            `, [req.params.id]);

            if (Number(counts[0].activeTasks) >= 10) {
                finalAvailability = "Busy";
            }
        }

        const [result] = await db.query(`
            UPDATE Service_Staff
            SET full_name = ?, role = ?, phone = ?, availability = ?
            WHERE staff_id = ?
        `, [
            full_name,
            role,
            phone,
            finalAvailability,
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