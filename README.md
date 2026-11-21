# HotelEase – Hotel Management System

Frontend (HTML/CSS/JS) + Backend (Node.js / Express) + MySQL, fully connected.

```
HotelEase/
├── backend/     Express API  (routes, MySQL pool, .env)
├── frontend/    The web app  (served by the backend)
└── database/
    ├── schema.sql   tables + service-charge trigger
    └── seed.sql     your original data (3 guests, 6 rooms, 5 bookings, ...)
```

## Run it

**1. Create the database** (MySQL 8 must be running)

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p hotel_management < database/seed.sql
```
(MySQL Workbench works too: open each file and run it, schema first.)

> Already have the `hotel_management` database with your data? Run only
> `schema.sql` – it never touches existing tables or rows, it just adds the
> trigger the backend relies on. Skip `seed.sql`.

**2. Set your MySQL password** in `backend/.env`
(see `.env.example`; DB name must be `hotel_management`).

**3. Start the server**

```bash
cd backend
npm install
npm start          # or: npm run dev
```

**4. Open http://localhost:5001**

The backend serves the frontend, so there is nothing else to start.
`http://localhost:5001/api/health/db` confirms the MySQL connection.

## How the pieces connect

| Frontend (js/script.js)        | API                                   | MySQL table(s)             |
|--------------------------------|---------------------------------------|----------------------------|
| Guests add / delete            | `/api/guests`                         | Guest                      |
| Rooms add / delete             | `/api/rooms`                          | Room                       |
| Bookings, check-in / check-out | `/api/bookings` (+ `/:id/status`)     | Booking (updates Room)     |
| Billing, invoices              | `/api/billing`                        | Billing                    |
| Staff                          | `/api/staff`                          | Service_Staff              |
| Service orders                 | `/api/services`                       | Service_Order (+ Billing)  |

`frontend/js/api.js` is the single place that talks to the server; every
screen loads from MySQL on start-up and re-syncs after each change.

## What was changed

**Frontend**
- Removed all hard-coded sample data; every table now loads from MySQL.
- Every add / delete / status change calls the API and then refreshes.
- Server error messages (duplicate email, room already booked, ...) are shown to the user.
- Bill charges are now calculated by the server (room nights x price + service
  orders), so the Room/Service charge fields in the bill form are read-only.
- User-entered text is HTML-escaped when drawn into tables.

**Backend**
- `dateStrings: true` on the MySQL pool – dates reach the browser as `2026-11-20`
  instead of timezone-shifted values.
- Backend now serves `frontend/`.
- New routes: `DELETE /api/bookings/:id`, `DELETE /api/services/:id`, `GET /api/guests/:id`.
- Bookings: accept an initial status; rooms in Maintenance / Out of Service
  can't be booked; status changes follow Confirmed -> Checked-In -> Checked-Out
  (or Cancelled); cancelling a *future* booking no longer frees a room that is
  currently occupied by someone else.
- Service orders: staff must be Available; cancel / un-cancel / delete now keep
  `Billing.total_amount` in sync, not just `service_charges`.
- Bills accept an initial payment status.

**Database**
- `schema.sql` was rebuilt from the table definitions stored inside your
  original `.ibd` files (same columns, keys, foreign keys).
- Your backend comments mention an existing trigger for service charges. A
  trigger isn't stored in the `.ibd` files, so `schema.sql` recreates it
  (`trg_service_order_after_insert`). If your own database already has a
  similar trigger, replace it with this one to avoid charges being added twice.
- `seed.sql` holds the rows recovered from your files.
