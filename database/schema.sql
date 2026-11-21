-- ============================================================
-- HotelEase - database schema
-- Reconstructed from the table definitions embedded in the
-- original hotel_management InnoDB files (MySQL 8).
-- Safe to run on a fresh server:  mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS hotel_management
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE hotel_management;

CREATE TABLE IF NOT EXISTS Guest (
    guest_id   INT NOT NULL AUTO_INCREMENT,
    full_name  VARCHAR(100) NOT NULL,
    email      VARCHAR(100) NULL,
    phone      VARCHAR(15)  NOT NULL,
    address    VARCHAR(225) NULL,
    PRIMARY KEY (guest_id),
    UNIQUE KEY email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Room (
    room_id         INT NOT NULL AUTO_INCREMENT,
    room_number     VARCHAR(10) NOT NULL,
    room_type       VARCHAR(30) NOT NULL,
    price_per_night DECIMAL(10,2) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'Available',
    PRIMARY KEY (room_id),
    UNIQUE KEY room_number (room_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Service_Staff (
    staff_id     INT NOT NULL AUTO_INCREMENT,
    full_name    VARCHAR(100) NOT NULL,
    role         VARCHAR(50)  NOT NULL,
    phone        VARCHAR(15)  NOT NULL,
    availability VARCHAR(20)  NOT NULL DEFAULT 'Available',
    PRIMARY KEY (staff_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Booking (
    booking_id     INT NOT NULL AUTO_INCREMENT,
    guest_id       INT NOT NULL,
    room_id        INT NOT NULL,
    check_in       DATE NOT NULL,
    check_out      DATE NOT NULL,
    booking_status VARCHAR(20) NOT NULL DEFAULT 'Confirmed',
    PRIMARY KEY (booking_id),
    KEY guest_id (guest_id),
    KEY room_id (room_id),
    CONSTRAINT booking_ibfk_1 FOREIGN KEY (guest_id) REFERENCES Guest (guest_id),
    CONSTRAINT booking_ibfk_2 FOREIGN KEY (room_id)  REFERENCES Room (room_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Billing (
    bill_id         INT NOT NULL AUTO_INCREMENT,
    booking_id      INT NOT NULL,
    room_charges    DECIMAL(10,2) NOT NULL,
    service_charges DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount    DECIMAL(10,2) NOT NULL,
    payment_status  VARCHAR(20) NOT NULL DEFAULT 'Pending',
    PRIMARY KEY (bill_id),
    UNIQUE KEY booking_id (booking_id),
    CONSTRAINT billing_ibfk_1 FOREIGN KEY (booking_id) REFERENCES Booking (booking_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Service_Order (
    order_id     INT NOT NULL AUTO_INCREMENT,
    booking_id   INT NOT NULL,
    staff_id     INT NULL,
    service_type VARCHAR(30) NOT NULL,
    description  VARCHAR(255) NULL,
    amount       DECIMAL(10,2) NOT NULL,
    order_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    PRIMARY KEY (order_id),
    KEY booking_id (booking_id),
    KEY staff_id (staff_id),
    CONSTRAINT service_order_ibfk_1 FOREIGN KEY (booking_id) REFERENCES Booking (booking_id),
    CONSTRAINT service_order_ibfk_2 FOREIGN KEY (staff_id)   REFERENCES Service_Staff (staff_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Trigger: when a (non-cancelled) service order is created, add
-- its amount to the booking's bill, if a bill already exists.
-- The backend relies on this (see backend/routes/serviceRoutes.js).
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_service_order_after_insert;

DELIMITER $$
CREATE TRIGGER trg_service_order_after_insert
AFTER INSERT ON Service_Order
FOR EACH ROW
BEGIN
    IF NEW.order_status <> 'Cancelled' THEN
        UPDATE Billing
        SET service_charges = service_charges + NEW.amount,
            total_amount    = total_amount    + NEW.amount
        WHERE booking_id = NEW.booking_id;
    END IF;
END$$
DELIMITER ;
