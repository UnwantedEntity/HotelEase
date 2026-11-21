-- ============================================================
-- HotelEase - seed data (recovered from your original database)
-- Run AFTER schema.sql:  mysql -u root -p hotel_management < seed.sql
-- Uses INSERT IGNORE, so rows that already exist are left alone.
-- Billing is inserted last so the service-order trigger does not
-- add charges on top of the already-correct bill amounts.
-- ============================================================

USE hotel_management;

INSERT IGNORE INTO Guest (guest_id, full_name, email, phone, address) VALUES
  ('1', 'Rahul Sharma', 'rahul@gmail.com', '9876543210', 'Patna, Bihar'),
  ('2', 'Priya Singh', 'priya@gmail.com', '9876543211', 'Pune, Maharashtra'),
  ('3', 'Amit Kumar', 'amit@gmail.com', '9876543212', 'Delhi');

INSERT IGNORE INTO Room (room_id, room_number, room_type, price_per_night, status) VALUES
  ('1', '101', 'Standard', '2000.00', 'Available'),
  ('2', '102', 'Deluxe', '3500.00', 'Available'),
  ('3', '103', 'Suite', '6000.00', 'Available'),
  ('4', '104', 'Standard', '2000.00', 'Maintenance'),
  ('5', '105', 'Deluxe', '3500.00', 'Available'),
  ('6', '106', 'Suite', '6000.00', 'Out of Service');

INSERT IGNORE INTO Service_Staff (staff_id, full_name, role, phone, availability) VALUES
  ('1', 'Amit Kumar', 'Housekeeping', '9876543210', 'Available'),
  ('2', 'Neha Verma', 'Concierge', '9876543211', 'Available'),
  ('3', 'Rohit Das', 'Laundry', '9876543212', 'Busy'),
  ('4', 'Sneha Patel', 'Dining', '9876543213', 'Available'),
  ('5', 'Karan Singh', 'Room Service', '9876543214', 'On Leave');

INSERT IGNORE INTO Booking (booking_id, guest_id, room_id, check_in, check_out, booking_status) VALUES
  ('1', '1', '1', '2026-11-20', '2026-11-23', 'Confirmed'),
  ('2', '2', '2', '2026-11-21', '2026-11-24', 'Confirmed'),
  ('3', '3', '3', '2026-11-22', '2026-11-25', 'Confirmed'),
  ('4', '1', '5', '2026-11-26', '2026-11-28', 'Confirmed'),
  ('6', '1', '1', '2026-12-10', '2026-12-13', 'Confirmed');

INSERT IGNORE INTO Service_Order (order_id, booking_id, staff_id, service_type, description, amount, order_status) VALUES
  ('1', '1', '4', 'Dining', 'Dinner order', '300.00', 'Completed'),
  ('2', '1', '3', 'Laundry', 'Clothes washing', '200.00', 'Completed'),
  ('3', '2', '1', 'Housekeeping', 'Room cleaning', '100.00', 'Pending'),
  ('4', '3', '2', 'Room Service', 'Extra towels', '150.00', 'In Progress'),
  ('5', '4', NULL, 'Dining', 'Breakfast order', '250.00', 'Pending');

INSERT IGNORE INTO Billing (bill_id, booking_id, room_charges, service_charges, total_amount, payment_status) VALUES
  ('1', '1', '6000.00', '500.00', '6500.00', 'Paid'),
  ('2', '2', '10500.00', '300.00', '10800.00', 'Pending'),
  ('3', '3', '18000.00', '1000.00', '19000.00', 'Paid'),
  ('4', '4', '4000.00', '200.00', '4200.00', 'Partially Paid');
