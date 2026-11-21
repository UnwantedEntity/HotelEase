const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Database connection
const db = require("./config/db");

// API routes
const guestRoutes = require("./routes/guestRoutes");
const roomRoutes = require("./routes/roomRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const billingRoutes = require("./routes/billingRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const staffRoutes = require("./routes/staffRoutes");

// Middleware
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());

// Serve the frontend (../frontend) from this same server,
// so the app is available at http://localhost:5001
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Database health check
app.get("/api/health/db", async (req, res, next) => {
    try {
        const [rows] = await db.query(
            "SELECT DATABASE() AS databaseName"
        );

        res.json({
            success: true,
            message: "MySQL connected successfully!",
            database: rows[0].databaseName
        });
    } catch (error) {
        next(error);
    }
});

// API routes
app.use("/api/guests", guestRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/staff", staffRoutes);

// Unknown routes
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found"
    });
});

// Central error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5001;

async function startServer() {
    try {
        const [columns] = await db.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'Billing'
              AND COLUMN_NAME = 'charge_through_date'
        `);

        if (columns.length === 0) {
            await db.query(`
                ALTER TABLE Billing
                ADD COLUMN charge_through_date DATE NULL
            `);
        }
    } catch (error) {
        console.error("Could not prepare billing schema:", error.message);
    }

    app.listen(PORT, () => {
        console.log(`HotelEase server running on port ${PORT}`);
    });
}

startServer();