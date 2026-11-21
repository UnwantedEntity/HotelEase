
// --------------------------------
// APPLICATION DATA
// All data lives in MySQL and is loaded through the backend API
// (see js/api.js). These arrays are only an in-memory copy of it.
// --------------------------------

let guests = [];
let rooms = [];
let bookings = [];
let bills = [];
let staff = [];
let serviceOrders = [];

// Convert API rows (MySQL column names) into the shape used by the UI.
const mapGuest = row => ({
    id: row.guest_id,
    name: row.full_name,
    email: row.email || "",
    phone: row.phone,
    address: row.address || ""
});

const mapRoom = row => ({
    id: row.room_id,
    number: row.room_number,
    type: row.room_type,
    price: Number(row.price_per_night),
    status: row.status
});

const mapBooking = row => ({
    id: row.booking_id,
    guestId: row.guest_id,
    roomId: row.room_id,
    guest: row.guest_name,
    room: row.room_number,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.booking_status
});

const mapBill = row => ({
    id: row.bill_id,
    bookingId: row.booking_id,
    roomCharges: Number(row.calculated_room_charges ?? row.room_charges),
    serviceCharges: Number(row.calculated_service_charges ?? row.service_charges),
    extraStayCharges: Number(row.calculated_extra_stay_charges ?? 0),
    chargeThroughDate: row.charge_through_date || "",
    totalAmount: Number(
        row.calculated_total_amount ??
        row.total_amount ??
        (Number(row.room_charges) + Number(row.service_charges))
    ),
    status: row.payment_status
});

const mapStaff = row => ({
    id: row.staff_id,
    name: row.full_name,
    role: row.role,
    phone: row.phone,
    availability: row.availability,
    activeTasks: Number(row.active_task_count ?? 0)
});

const mapService = row => ({
    id: row.order_id,
    bookingId: row.booking_id,
    staffId: row.staff_id,
    type: row.service_type,
    description: row.description || "",
    amount: Number(row.amount),
    status: row.order_status
});

async function loadGuests()   { guests = (await API.guests.getAll()).map(mapGuest); }
async function loadRooms()    { rooms = (await API.rooms.getAll()).map(mapRoom); }
async function loadBookings() { bookings = (await API.bookings.getAll()).map(mapBooking); }
async function loadBills()    { bills = (await API.billing.getAll()).map(mapBill); }
async function loadStaff()    { staff = (await API.staff.getAll()).map(mapStaff); }
async function loadServices() { serviceOrders = (await API.services.getAll()).map(mapService); }

// Re-draw every table, keeping whatever is typed in the search boxes.
function renderAll() {
    renderGuests(document.getElementById("guest-search").value);
    renderRooms(document.getElementById("room-search").value);
    renderBookings(document.getElementById("booking-search").value);
    renderBills(document.getElementById("billing-search").value);
    renderStaff(document.getElementById("staff-search").value);
    renderServices(document.getElementById("service-search").value);
    updateDashboard();
}

// Fetch everything from the database and refresh the screen.
async function loadAll() {
    await Promise.all([
        loadGuests(), loadRooms(), loadBookings(),
        loadBills(), loadStaff(), loadServices()
    ]);
    renderAll();
}

// Run an API action; on failure show the server's message and re-sync.
async function runAction(action, successMessage) {
    try {
        await action();
        if (successMessage) alert(successMessage);
        return true;
    } catch (error) {
        alert(error.message || "Something went wrong.");
        try { await loadAll(); } catch (_) { /* server unreachable */ }
        return false;
    }
}

// --------------------------------
// SIDEBAR NAVIGATION
// --------------------------------

const navLinks = document.querySelectorAll(".nav-link");
const pages = document.querySelectorAll(".page-section");
const pageTitle = document.getElementById("page-title");

navLinks.forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();

        const page = link.dataset.page;

        navLinks.forEach(item => item.classList.remove("active"));
        link.classList.add("active");

        pages.forEach(section => {
            section.classList.remove("active");
        });

        document.getElementById(page).classList.add("active");

        pageTitle.textContent =
            page.charAt(0).toUpperCase() + page.slice(1);
    });
});


// --------------------------------
// DASHBOARD
// --------------------------------

function updateDashboard() {
    document.getElementById("total-rooms").textContent = rooms.length;
    document.getElementById("total-guests").textContent = guests.length;
    document.getElementById("total-bookings").textContent = bookings.length;

    const dateInput = document.getElementById("dashboard-date");
    const selectedDate = dateInput?.value || new Date().toISOString().slice(0, 10);
    if (dateInput && !dateInput.value) dateInput.value = selectedDate;

    const occupiedRoomIds = new Set(
        bookings
            .filter(booking =>
                booking.status !== "Cancelled" &&
                booking.status !== "Checked-Out" &&
                booking.checkIn <= selectedDate &&
                booking.checkOut > selectedDate
            )
            .map(booking => Number(booking.roomId))
    );

    const unavailableRoomIds = new Set(
        rooms
            .filter(room =>
                room.status === "Maintenance" ||
                room.status === "Out of Service"
            )
            .map(room => Number(room.id))
    );

    const available = rooms.filter(room =>
        !unavailableRoomIds.has(Number(room.id)) &&
        !occupiedRoomIds.has(Number(room.id))
    ).length;
    const occupied = occupiedRoomIds.size;
    const arrivals = bookings.filter(
        booking => booking.status !== "Cancelled" &&
            booking.checkIn === selectedDate
    ).length;
    const departures = bookings.filter(
        booking => booking.status !== "Cancelled" &&
            booking.checkOut === selectedDate
    ).length;

    document.getElementById("available-rooms").textContent = available;
    document.getElementById("occupied-rooms").textContent = occupied;
    document.getElementById("arrival-count").textContent = arrivals;
    document.getElementById("departure-count").textContent = departures;

    const table = document.getElementById("recent-bookings");

    table.innerHTML = bookings.slice(0, 5).map(booking => `
        <tr>
            <td>#${booking.id}</td>
            <td>${escapeHTML(booking.guest)}</td>
            <td>${escapeHTML(booking.room)}</td>
            <td>${escapeHTML(booking.checkIn)}</td>
            <td>${escapeHTML(booking.status)}</td>
        </tr>
    `).join("");
}


// --------------------------------
// GUEST MANAGEMENT
// --------------------------------

const guestFormCard = document.getElementById("guest-form-card");

document.getElementById("show-guest-form").addEventListener("click", () => {
    guestFormCard.classList.remove("hidden");
});

document.getElementById("cancel-guest-form").addEventListener("click", () => {
    guestFormCard.classList.add("hidden");
    document.getElementById("guest-form").reset();
});

function renderGuests(search = "") {
    const table = document.getElementById("guest-table");

    const filtered = guests.filter(guest =>
        Object.values(guest).some(value =>
            String(value).toLowerCase().includes(search.toLowerCase())
        )
    );

    table.innerHTML = filtered.map(guest => `
        <tr>
            <td>${guest.id}</td>
            <td>${escapeHTML(guest.name)}</td>
            <td>${escapeHTML(guest.email)}</td>
            <td>${escapeHTML(guest.phone)}</td>
            <td>${escapeHTML(guest.address)}</td>
            <td>
                <button class="delete-btn"
                    onclick="deleteGuest(${guest.id})">
                    Delete
                </button>
            </td>
        </tr>
    `).join("") || `
        <tr><td colspan="6">No guests found.</td></tr>
    `;
}

document.getElementById("guest-form").addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.target;
    const email = document.getElementById("guest-email").value.trim();

    if (email && guests.some(guest => guest.email.toLowerCase() === email.toLowerCase())) {
        alert("This email already exists.");
        return;
    }

    const saved = await runAction(async () => {
        await API.guests.create({
            full_name: document.getElementById("guest-name").value.trim(),
            email: email,
            phone: document.getElementById("guest-phone").value.trim(),
            address: document.getElementById("guest-address").value.trim()
        });

        await loadGuests();
        renderGuests(document.getElementById("guest-search").value);
        updateDashboard();
    }, "Guest added successfully!");

    if (saved) {
        form.reset();
        guestFormCard.classList.add("hidden");
    }
});

async function deleteGuest(id) {
    if (!confirm("Are you sure you want to delete this guest?")) return;

    await runAction(async () => {
        await API.guests.delete(id);
        await loadGuests();
        renderGuests(document.getElementById("guest-search").value);
        updateDashboard();
    });
}

document.getElementById("guest-search").addEventListener("input", event => {
    renderGuests(event.target.value);
});


// --------------------------------
// ROOM MANAGEMENT
// --------------------------------

const roomFormCard = document.getElementById("room-form-card");

document.getElementById("show-room-form").addEventListener("click", () => {
    roomFormCard.classList.remove("hidden");
});

document.getElementById("cancel-room-form").addEventListener("click", () => {
    roomFormCard.classList.add("hidden");
    document.getElementById("room-form").reset();
});

function renderRooms(search = "") {
    const table = document.getElementById("room-table");

    const filtered = rooms.filter(room =>
        Object.values(room).some(value =>
            String(value).toLowerCase().includes(search.toLowerCase())
        )
    );

    table.innerHTML = filtered.map(room => {
        const statusClass = room.status.toLowerCase().replaceAll(" ", "-");

        return `
            <tr>
                <td>${room.id}</td>
                <td>${escapeHTML(room.number)}</td>
                <td>${escapeHTML(room.type)}</td>
                <td>₹${Number(room.price).toLocaleString("en-IN")}</td>
                <td>
                    <span class="status status-${statusClass}">
                        ${room.status}
                    </span>
                </td>
                <td>
                    <button class="delete-btn"
                        onclick="deleteRoom(${room.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join("") || `
        <tr><td colspan="6">No rooms found.</td></tr>
    `;
}

document.getElementById("room-form").addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.target;
    const number = document.getElementById("room-number").value.trim();

    if (rooms.some(room => room.number === number)) {
        alert("This room number already exists.");
        return;
    }

    const saved = await runAction(async () => {
        await API.rooms.create({
            room_number: number,
            room_type: document.getElementById("room-type").value,
            price_per_night: Number(document.getElementById("room-price").value),
            status: document.getElementById("room-status").value
        });

        await loadRooms();
        renderRooms(document.getElementById("room-search").value);
        updateDashboard();
    }, "Room added successfully!");

    if (saved) {
        form.reset();
        roomFormCard.classList.add("hidden");
    }
});

async function deleteRoom(id) {
    if (!confirm("Are you sure you want to delete this room?")) return;

    await runAction(async () => {
        await API.rooms.delete(id);
        await loadRooms();
        renderRooms(document.getElementById("room-search").value);
        updateDashboard();
    });
}

document.getElementById("room-search").addEventListener("input", event => {
    renderRooms(event.target.value);
});



// ========================================
// BOOKING MANAGEMENT
// ========================================

function nextId(items) {
    return Math.max(0, ...items.map(item => item.id)) + 1;
}

function showForm(formId) {
    document.getElementById(formId).classList.remove("hidden");
}

function hideForm(formId, formElementId) {
    document.getElementById(formId).classList.add("hidden");
    document.getElementById(formElementId).reset();
}

// ----------------------------------------
// BOOKING FORM
// ----------------------------------------

function populateBookingOptions() {
    const guestSelect = document.getElementById("booking-guest");
    const roomSelect = document.getElementById("booking-room");

    guestSelect.innerHTML = '<option value="">Select guest</option>' +
        guests.map(guest =>
            `<option value="${guest.id}">${escapeHTML(guest.name)}</option>`
        ).join("");

    roomSelect.innerHTML = '<option value="">Select room</option>' +
        rooms
            .filter(room => room.status === "Available")
            .map(room =>
                `<option value="${room.id}">${escapeHTML(room.number)} - ${escapeHTML(room.type)}</option>`
            ).join("");
}

document.getElementById("show-booking-form").addEventListener("click", () => {
    populateBookingOptions();
    showForm("booking-form-card");
});

document.getElementById("cancel-booking-form").addEventListener("click", () => {
    hideForm("booking-form-card", "booking-form");
});

function hasBookingConflict(roomId, checkIn, checkOut) {
    return bookings.some(booking =>
        Number(booking.roomId) === Number(roomId) &&
        booking.status !== "Cancelled" &&
        booking.status !== "Checked-Out" &&
        checkIn < booking.checkOut &&
        checkOut > booking.checkIn
    );
}

function renderBookings(search = "") {
    const table = document.getElementById("booking-table");

    const filtered = bookings.filter(booking => {
        const guest = guests.find(g => g.id === booking.guestId);
        const room = rooms.find(r => r.id === booking.roomId);

        const text = [
            booking.id,
            guest?.name || booking.guest,
            room?.number || booking.room,
            booking.checkIn,
            booking.checkOut,
            booking.status
        ].join(" ").toLowerCase();

        return text.includes(search.toLowerCase());
    });

    table.innerHTML = filtered.map(booking => {
        const guest = guests.find(g => g.id === booking.guestId);
        const room = rooms.find(r => r.id === booking.roomId);

        const guestName = guest?.name || booking.guest || "Guest unavailable";
        const roomNumber = room?.number || booking.room || "Room unavailable";
        const statusClass = booking.status.toLowerCase().replaceAll(" ", "-");

        return `
            <tr>
                <td>#${booking.id}</td>
                <td>${escapeHTML(guestName)}</td>
                <td>${escapeHTML(roomNumber)}</td>
                <td>${escapeHTML(booking.checkIn)}</td>
                <td>${escapeHTML(booking.checkOut)}</td>
                <td><span class="status status-${statusClass}">${booking.status}</span></td>
                <td>
                    ${
                        booking.status === "Confirmed"
                            ? `<button class="primary-btn"
                                onclick="checkInBooking(${booking.id})">Check In</button>`
                            : booking.status === "Checked-In"
                                ? `<button class="primary-btn"
                                    onclick="checkOutBooking(${booking.id})">Check Out</button>`
                                : booking.status === "Checked-Out"
                                    ? `<span class="status status-checked-out">Completed</span>`
                                    : `<span>-</span>`
                    }
                    <button class="delete-btn"
                        onclick="deleteBooking(${booking.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join("") || `
        <tr><td colspan="7">No bookings found.</td></tr>
    `;
}

document.getElementById("booking-form").addEventListener("submit", async event => {
    event.preventDefault();

    const guestId = Number(document.getElementById("booking-guest").value);
    const roomId = Number(document.getElementById("booking-room").value);
    const checkIn = document.getElementById("booking-checkin").value;
    const checkOut = document.getElementById("booking-checkout").value;
    const status = document.getElementById("booking-status").value;

    if (!guestId || !roomId) {
        alert("Please select a guest and a room.");
        return;
    }

    if (checkOut <= checkIn) {
        alert("Check-out must be after check-in.");
        return;
    }

    if (hasBookingConflict(roomId, checkIn, checkOut)) {
        alert("This room already has a booking during these dates.");
        return;
    }

    const saved = await runAction(async () => {
        await API.bookings.create({
            guest_id: guestId,
            room_id: roomId,
            check_in: checkIn,
            check_out: checkOut,
            booking_status: status
        });

        // A checked-in booking also changes the room's status
        await Promise.all([loadBookings(), loadRooms()]);
        renderBookings(document.getElementById("booking-search").value);
        renderRooms(document.getElementById("room-search").value);
        updateDashboard();
    }, "Booking created successfully!");

    if (saved) hideForm("booking-form-card", "booking-form");
});

async function deleteBooking(id) {
    if (!confirm("Delete this booking?")) return;

    // Do not delete a booking that already has a bill.
    if (bills.some(bill => bill.bookingId === id)) {
        alert("This booking has a bill. It cannot be deleted here.");
        return;
    }

    await runAction(async () => {
        await API.bookings.delete(id);
        await Promise.all([loadBookings(), loadRooms()]);
        renderBookings(document.getElementById("booking-search").value);
        renderRooms(document.getElementById("room-search").value);
        updateDashboard();
    });
}

document.getElementById("booking-search").addEventListener("input", event => {
    renderBookings(event.target.value);
});


// ========================================
// BILLING MANAGEMENT
// ========================================

function formatCurrency(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function populateBillingOptions() {
    const select = document.getElementById("billing-booking");

    const unbilledBookings = bookings.filter(booking =>
        !bills.some(bill => bill.bookingId === booking.id)
    );

    select.innerHTML = '<option value="">Select booking</option>' +
        unbilledBookings.map(booking => {
            const guest = guests.find(g => g.id === booking.guestId);
            const room = rooms.find(r => r.id === booking.roomId);

            return `<option value="${booking.id}">
                Booking #${booking.id} - ${escapeHTML(guest?.name || booking.guest || "Guest")}
                - Room ${escapeHTML(room?.number || booking.room)}
            </option>`;
        }).join("");
}

function calculateRoomCharges(booking, chargeThroughDate = booking?.checkOut) {
    const room = rooms.find(r => r.id === booking.roomId);

    if (!room) return 0;

    const toUtcMillis = value => {
        const [year, month, day] = value.slice(0, 10).split("-").map(Number);
        return Date.UTC(year, month - 1, day);
    };

    const nights = Math.floor(
        (toUtcMillis(chargeThroughDate || booking.checkOut) - toUtcMillis(booking.checkIn)) /
        (1000 * 60 * 60 * 24)
    );

    return nights > 0 ? nights * room.price : 0;
}

function calculateServiceCharges(booking) {
    return serviceOrders
        .filter(order =>
            order.bookingId === booking.id && order.status !== "Cancelled"
        )
        .reduce((sum, order) => sum + order.amount, 0);
}

function updateBillingTotal() {
    const roomCharges = Number(
        document.getElementById("billing-room-charges").value
    ) || 0;

    const serviceCharges = Number(
        document.getElementById("billing-service-charges").value
    ) || 0;

    document.getElementById("billing-total").value =
        formatCurrency(roomCharges + serviceCharges);
}

document.getElementById("show-billing-form").addEventListener("click", () => {
    populateBillingOptions();
    showForm("billing-form-card");
});

document.getElementById("cancel-billing-form").addEventListener("click", () => {
    hideForm("billing-form-card", "billing-form");
});

document.getElementById("billing-booking").addEventListener("change", event => {
    const booking = bookings.find(
        b => b.id === Number(event.target.value)
    );

    const chargeThrough = document.getElementById("billing-charge-through");
    chargeThrough.value = booking ? booking.checkOut : "";
    chargeThrough.min = booking ? booking.checkIn : "";

    document.getElementById("billing-room-charges").value =
        booking ? calculateRoomCharges(booking, chargeThrough.value) : "";

    document.getElementById("billing-service-charges").value =
        booking ? calculateServiceCharges(booking) : 0;

    updateBillingTotal();
});

document.getElementById("billing-charge-through").addEventListener("change", event => {
    const booking = bookings.find(
        b => b.id === Number(document.getElementById("billing-booking").value)
    );

    if (!booking) return;

    if (event.target.value < booking.checkIn) {
        event.target.value = booking.checkIn;
    }

    document.getElementById("billing-room-charges").value =
        calculateRoomCharges(booking, event.target.value);
    updateBillingTotal();
});

document.getElementById("billing-room-charges").addEventListener("input", updateBillingTotal);
document.getElementById("billing-service-charges").addEventListener("input", updateBillingTotal);

function renderBills(search = "") {
    const table = document.getElementById("billing-table");

    const filtered = bills.filter(bill => {
        const booking = bookings.find(b => b.id === bill.bookingId);
        const guest = booking
            ? guests.find(g => g.id === booking.guestId)
            : null;

        const text = [
            bill.id,
            bill.bookingId,
            guest?.name || "",
            bill.status
        ].join(" ").toLowerCase();

        return text.includes(search.toLowerCase());
    });

    table.innerHTML = filtered.map(bill => {
        const booking = bookings.find(b => b.id === bill.bookingId);
        const guest = booking
            ? guests.find(g => g.id === booking.guestId)
            : null;

        const total = Number.isFinite(bill.totalAmount)
            ? bill.totalAmount
            : bill.roomCharges + bill.serviceCharges;
        const statusClass = bill.status.toLowerCase().replaceAll(" ", "-");

        return `
            <tr>
                <td>#${bill.id}</td>
                <td>#${bill.bookingId}</td>
                <td>${escapeHTML(guest?.name || "Guest unavailable")}</td>
                <td>${formatCurrency(bill.roomCharges)}</td>
                <td>${formatCurrency(bill.serviceCharges)}</td>
                <td><strong>${formatCurrency(total)}</strong></td>
                <td><span class="status status-${statusClass}">${bill.status}</span></td>
                <td>
                    <button class="primary-btn"
                        onclick="printInvoice(${bill.id})">
                        View / Print
                    </button>
                </td>
            </tr>
        `;
    }).join("") || `
        <tr><td colspan="7">No bills found.</td></tr>
    `;
}

document.getElementById("billing-form").addEventListener("submit", async event => {
    event.preventDefault();

    const bookingId = Number(document.getElementById("billing-booking").value);
    const status = document.getElementById("billing-status").value;
    const chargeThroughDate = document.getElementById("billing-charge-through").value;

    if (!bookingId) {
        alert("Please select a booking.");
        return;
    }

    if (bills.some(bill => bill.bookingId === bookingId)) {
        alert("A bill already exists for this booking.");
        return;
    }

    if (!chargeThroughDate) {
        alert("Please select a charge-through date.");
        return;
    }

    const booking = bookings.find(item => item.id === bookingId);
    if (booking && chargeThroughDate < booking.checkIn) {
        alert("Charge-through date cannot be before check-in.");
        return;
    }

    // Room and service charges are calculated by the server
    // from the booking dates, room price and service orders.
    const saved = await runAction(async () => {
        await API.billing.create({
            booking_id: bookingId,
            charge_through_date: chargeThroughDate,
            payment_status: status
        });

        await loadBills();
        renderBills(document.getElementById("billing-search").value);
    }, "Bill created successfully!");

    if (saved) hideForm("billing-form-card", "billing-form");
});

document.getElementById("billing-search").addEventListener("input", event => {
    renderBills(event.target.value);
});

// ========================================
// STAFF MANAGEMENT
// ========================================

document.getElementById("show-staff-form").addEventListener("click", () => {
    showForm("staff-form-card");
});

document.getElementById("cancel-staff-form").addEventListener("click", () => {
    hideForm("staff-form-card", "staff-form");
});

function renderStaff(search = "") {
    const table = document.getElementById("staff-table");

    const filtered = staff.filter(member =>
        Object.values(member).some(value =>
            String(value).toLowerCase().includes(search.toLowerCase())
        )
    );

    table.innerHTML = filtered.map(member => {
        const statusClass = member.availability.toLowerCase().replaceAll(" ", "-");

        return `
            <tr>
                <td>${member.id}</td>
                <td>${escapeHTML(member.name)}</td>
                <td>${escapeHTML(member.role)}</td>
                <td>${escapeHTML(member.phone)}</td>
                <td>
                    <span class="status status-${statusClass}">
                        ${escapeHTML(member.availability)}
                    </span>
                </td>
                <td>${member.activeTasks} / 10</td>
                <td>
                    <button class="delete-btn"
                        onclick="deleteStaff(${member.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join("") || `
        <tr><td colspan="7">No staff members found.</td></tr>
    `;
}

document.getElementById("staff-form").addEventListener("submit", async event => {
    event.preventDefault();

    const saved = await runAction(async () => {
        await API.staff.create({
            full_name: document.getElementById("staff-name").value.trim(),
            role: document.getElementById("staff-role").value,
            phone: document.getElementById("staff-phone").value.trim(),
            availability: document.getElementById("staff-availability").value
        });

        await loadStaff();
        renderStaff(document.getElementById("staff-search").value);
    }, "Staff member added successfully!");

    if (saved) hideForm("staff-form-card", "staff-form");
});

async function deleteStaff(id) {
    if (!confirm("Delete this staff member?")) return;

    await runAction(async () => {
        await API.staff.delete(id);
        await Promise.all([loadStaff(), loadServices()]);
        renderStaff(document.getElementById("staff-search").value);
        renderServices(document.getElementById("service-search").value);
    });
}

document.getElementById("staff-search").addEventListener("input", event => {
    renderStaff(event.target.value);
});


// ========================================
// SERVICE MANAGEMENT
// ========================================

// Populate booking and staff dropdowns

function populateServiceOptions() {
    const bookingSelect = document.getElementById("service-booking");
    const staffSelect = document.getElementById("service-staff");

    bookingSelect.innerHTML =
        '<option value="">Select booking</option>' +
        bookings.map(booking => {
            const guest = guests.find(g => g.id === booking.guestId);

            return `
                <option value="${booking.id}">
                    Booking #${booking.id} - ${escapeHTML(guest?.name || booking.guest)}
                </option>
            `;
        }).join("");

    staffSelect.innerHTML =
        '<option value="">Unassigned</option>' +
        staff.map(member => `
            <option value="${member.id}"
                ${member.availability !== "Available" || member.activeTasks >= 10 ? "disabled" : ""}>
                ${escapeHTML(member.name)} - ${escapeHTML(member.role)} (${member.activeTasks}/10)
            </option>
        `).join("");
}


// Open and close service form

document.getElementById("show-service-form").addEventListener("click", () => {
    populateServiceOptions();
    showForm("service-form-card");
});

document.getElementById("cancel-service-form").addEventListener("click", () => {
    hideForm("service-form-card", "service-form");
});


// Render service orders

function renderServices(search = "") {
    const table = document.getElementById("service-table");

    const filtered = serviceOrders.filter(order => {
        const member = staff.find(s => s.id === order.staffId);

        const text = [
            order.id,
            order.bookingId,
            order.type,
            order.description,
            member?.name || "Unassigned",
            order.status
        ].join(" ").toLowerCase();

        return text.includes(search.toLowerCase());
    });

    table.innerHTML = filtered.map(order => {
        const member = staff.find(s => s.id === order.staffId);
        const statusClass = order.status.toLowerCase().replaceAll(" ", "-");

        return `
            <tr>
                <td>#${order.id}</td>
                <td>#${order.bookingId}</td>
                <td>${escapeHTML(order.type)}</td>
                <td>${escapeHTML(order.description || "-")}</td>
                <td>${escapeHTML(member?.name || "Unassigned")}</td>
                <td>${formatCurrency(order.amount)}</td>

                <td>
                    <select onchange="updateServiceStatus(${order.id}, this.value)">
                        <option ${order.status === "Pending" ? "selected" : ""}>Pending</option>
                        <option ${order.status === "In Progress" ? "selected" : ""}>In Progress</option>
                        <option ${order.status === "Completed" ? "selected" : ""}>Completed</option>
                        <option ${order.status === "Cancelled" ? "selected" : ""}>Cancelled</option>
                    </select>
                </td>

                <td>
                    <button class="delete-btn"
                        onclick="deleteService(${order.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join("") || `
        <tr><td colspan="8">No service orders found.</td></tr>
    `;
}


// Create a new service order

document.getElementById("service-form").addEventListener("submit", async event => {
    event.preventDefault();

    const bookingId = Number(document.getElementById("service-booking").value);
    const staffValue = document.getElementById("service-staff").value;
    const staffId = staffValue ? Number(staffValue) : null;

    const type = document.getElementById("service-type").value;
    const amount = Number(document.getElementById("service-amount").value);
    const description = document.getElementById("service-description").value.trim();
    const status = document.getElementById("service-status").value;

    if (!bookingId) {
        alert("Please select a booking.");
        return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
        alert("Please enter a valid service amount.");
        return;
    }

    if (staffId !== null) {
        const selectedStaff = staff.find(member => member.id === staffId);

        if (!selectedStaff || selectedStaff.availability !== "Available") {
            alert("Selected staff member is not available.");
            return;
        }

        if (selectedStaff.activeTasks >= 10) {
            alert("This staff member already has the maximum of 10 active tasks.");
            return;
        }
    }

    const saved = await runAction(async () => {
        // The backend recalculates the existing bill from all active services
        await API.services.create({
            booking_id: bookingId,
            staff_id: staffId,
            service_type: type,
            description: description,
            amount: amount,
            order_status: status
        });

        await Promise.all([loadServices(), loadBills()]);
        renderServices(document.getElementById("service-search").value);
        renderBills(document.getElementById("billing-search").value);
    }, "Service order created successfully!");

    if (saved) hideForm("service-form-card", "service-form");
});

// Update service order status

async function updateServiceStatus(id, newStatus) {
    await runAction(async () => {
        await API.services.updateStatus(id, newStatus);

        // Cancelling / un-cancelling changes the bill's service charges
        await Promise.all([loadServices(), loadBills()]);
        renderServices(document.getElementById("service-search").value);
        renderBills(document.getElementById("billing-search").value);
    });
}

// Delete service order

async function deleteService(id) {
    if (!serviceOrders.some(item => item.id === id)) return;

    if (!confirm("Delete this service order?")) return;

    await runAction(async () => {
        await API.services.delete(id);

        await Promise.all([loadServices(), loadBills()]);
        renderServices(document.getElementById("service-search").value);
        renderBills(document.getElementById("billing-search").value);
    });
}


// Search service orders

document.getElementById("service-search").addEventListener("input", event => {
    renderServices(event.target.value);
});



// ========================================
// BOOKING CHECK-IN / CHECK-OUT
// ========================================

async function changeBookingStatus(id, status, successMessage) {
    await runAction(async () => {
        await API.bookings.updateStatus(id, status);

        // Room status changes together with the booking status
        await Promise.all([loadBookings(), loadRooms()]);
        renderBookings(document.getElementById("booking-search").value);
        renderRooms(document.getElementById("room-search").value);
        updateDashboard();
    }, successMessage);
}

async function checkInBooking(id) {
    const booking = bookings.find(item => item.id === id);

    if (!booking || booking.status !== "Confirmed") {
        alert("Only confirmed bookings can be checked in.");
        return;
    }

    const room = rooms.find(item => item.id === booking.roomId);

    if (!room || room.status !== "Available") {
        alert("This room is not currently available.");
        return;
    }

    await changeBookingStatus(id, "Checked-In", "Guest checked in successfully!");
}

async function checkOutBooking(id) {
    const booking = bookings.find(item => item.id === id);

    if (!booking || booking.status !== "Checked-In") {
        alert("Only checked-in bookings can be checked out.");
        return;
    }

    await changeBookingStatus(id, "Checked-Out", "Guest checked out successfully!");
}


// ========================================
// INVOICE GENERATION
// ========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function printInvoice(billId) {
    const bill = bills.find(item => item.id === billId);

    if (!bill) {
        alert("Bill not found.");
        return;
    }

    const booking = bookings.find(item => item.id === bill.bookingId);

    if (!booking) {
        alert("Booking not found.");
        return;
    }

    const guest = guests.find(item => item.id === booking.guestId);
    const room = rooms.find(item => item.id === booking.roomId);

    const relatedServices = serviceOrders.filter(order =>
        order.bookingId === booking.id && order.status !== "Cancelled"
    );

    const serviceRows = relatedServices.map(order => `
        <tr>
            <td>${escapeHTML(order.type)}</td>
            <td>${escapeHTML(order.description || "-")}</td>
            <td>${formatCurrency(order.amount)}</td>
        </tr>
    `).join("");

    const total = Number.isFinite(bill.totalAmount)
        ? bill.totalAmount
        : Number(bill.roomCharges) + Number(bill.serviceCharges);
    const invoiceWindow = window.open("", "_blank");

    if (!invoiceWindow) {
        alert("Please allow pop-ups to view or print the invoice.");
        return;
    }

    invoiceWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice #${bill.id} - HotelEase</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: Arial, sans-serif;
                    padding: 35px;
                    color: #1e293b;
                    background: #f8fafc;
                }
                .invoice {
                    max-width: 850px;
                    margin: auto;
                    padding: 35px;
                    background: white;
                    border: 1px solid #e2e8f0;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    gap: 20px;
                    border-bottom: 2px solid #2563eb;
                    padding-bottom: 20px;
                }
                h1 { color: #1d4ed8; margin: 0 0 8px; }
                h2 { margin: 0 0 10px; }
                .details {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 25px;
                    margin: 28px 0;
                }
                .details p { margin: 7px 0; }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0 25px;
                }
                th, td {
                    padding: 12px;
                    border-bottom: 1px solid #e2e8f0;
                    text-align: left;
                }
                th { background: #eff6ff; }
                .total {
                    text-align: right;
                    margin-top: 25px;
                    font-size: 22px;
                    font-weight: bold;
                }
                .footer {
                    margin-top: 55px;
                    text-align: center;
                    color: #64748b;
                }
                .print-button {
                    margin-top: 25px;
                    padding: 11px 18px;
                    border: 0;
                    border-radius: 6px;
                    background: #2563eb;
                    color: white;
                    cursor: pointer;
                }
                @media print {
                    body { padding: 0; background: white; }
                    .invoice { border: 0; padding: 0; }
                    .print-button { display: none; }
                }
                @media (max-width: 600px) {
                    body { padding: 10px; }
                    .invoice { padding: 15px; }
                    .details { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <main class="invoice">
                <div class="header">
                    <div>
                        <h1>HotelEase</h1>
                        <p>Hotel Management System</p>
                    </div>
                    <div>
                        <h2>INVOICE</h2>
                        <p>Invoice No: #${bill.id}</p>
                        <p>Booking No: #${booking.id}</p>
                        <p>Payment: ${escapeHTML(bill.status)}</p>
                    </div>
                </div>

                <div class="details">
                    <section>
                        <h3>Guest Details</h3>
                        <p>${escapeHTML(guest?.name || booking.guest || "Guest")}</p>
                        <p>${escapeHTML(guest?.email || "")}</p>
                        <p>${escapeHTML(guest?.phone || "")}</p>
                        <p>${escapeHTML(guest?.address || "")}</p>
                    </section>
                    <section>
                        <h3>Booking Details</h3>
                        <p>Room: ${escapeHTML(room?.number || booking.room || "-")}</p>
                        <p>Room Type: ${escapeHTML(room?.type || "-")}</p>
                        <p>Check-in: ${escapeHTML(booking.checkIn)}</p>
                        <p>Check-out: ${escapeHTML(booking.checkOut)}</p>
                        ${bill.chargeThroughDate ? `<p>Charge through: ${escapeHTML(bill.chargeThroughDate)}</p>` : ""}
                        <p>Status: ${escapeHTML(booking.status)}</p>
                    </section>
                </div>

                <h3>Charges</h3>
                <table>
                    <thead>
                        <tr><th>Description</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Room Charges</td><td>${formatCurrency(bill.roomCharges)}</td></tr>
                        ${bill.extraStayCharges > 0 ? `
                        <tr><td>Extra Stay Charges</td><td>${formatCurrency(bill.extraStayCharges)}</td></tr>
                        ` : ""}
                        <tr><td>Service Charges</td><td>${formatCurrency(bill.serviceCharges)}</td></tr>
                    </tbody>
                </table>

                <h3>Service Details</h3>
                <table>
                    <thead>
                        <tr><th>Service</th><th>Description</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                        ${serviceRows || '<tr><td colspan="3">No service details available.</td></tr>'}
                    </tbody>
                </table>

                <div class="total">Total: ${formatCurrency(total)}</div>

                <div class="footer">
                    <p>Thank you for choosing HotelEase!</p>
                    <p>This is a computer-generated invoice.</p>
                </div>

                <button class="print-button" onclick="window.print()">Print Invoice</button>
            </main>
        </body>
        </html>
    `);

    invoiceWindow.document.close();
}


// ========================================
// FINAL FRONTEND VALIDATION
// ========================================

// Keep checkout date after check-in date.
const checkInDateInput = document.getElementById("booking-checkin");
const checkOutDateInput = document.getElementById("booking-checkout");

checkInDateInput.addEventListener("change", () => {
    checkOutDateInput.min = checkInDateInput.value;

    if (checkOutDateInput.value &&
        checkOutDateInput.value <= checkInDateInput.value) {
        checkOutDateInput.value = "";
    }
});

// Restrict phone inputs to digits. HTML pattern enforces length on submit.
["guest-phone", "staff-phone"].forEach(id => {
    const input = document.getElementById(id);

    input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 15);
    });

    const dashboardDateInput = document.getElementById("dashboard-date");
    if (dashboardDateInput) {
        dashboardDateInput.value = new Date().toISOString().slice(0, 10);
        dashboardDateInput.addEventListener("change", updateDashboard);
    }
});

// Extra client-side validation for all amount inputs.
[
    "room-price",
    "billing-room-charges",
    "billing-service-charges",
    "service-amount"
].forEach(id => {
    const input = document.getElementById(id);

    input.addEventListener("input", () => {
        if (input.value !== "" && Number(input.value) < 0) {
            input.setCustomValidity("Amount cannot be negative.");
        } else {
            input.setCustomValidity("");
        }
    });
});

// Load everything from the MySQL database through the backend API.
loadAll().catch(error => {
    console.error(error);
    alert(
        "Could not load data from the server.\n\n" +
        "Make sure the backend is running (cd backend && npm start) " +
        "and MySQL is connected."
    );
});
