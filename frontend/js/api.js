// When the page is served by the backend (http://localhost:5001) use a
// relative URL; if it is opened some other way (file://, Live Server...)
// fall back to the backend's address.
const API_BASE_URL = window.location.port === "5001"
    ? "/api"
    : "http://localhost:5001/api";

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        },
        ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
}

const API = {
    guests: {
        getAll: () => apiRequest("/guests"),
        getById: (id) => apiRequest(`/guests/${id}`),
        create: (data) => apiRequest("/guests", {
            method: "POST",
            body: JSON.stringify(data)
        }),
        update: (id, data) => apiRequest(`/guests/${id}`, {
            method: "PUT",
            body: JSON.stringify(data)
        }),
        delete: (id) => apiRequest(`/guests/${id}`, {
            method: "DELETE"
        })
    },

    rooms: {
        getAll: () => apiRequest("/rooms"),
        getById: (id) => apiRequest(`/rooms/${id}`),
        create: (data) => apiRequest("/rooms", {
            method: "POST",
            body: JSON.stringify(data)
        }),
        update: (id, data) => apiRequest(`/rooms/${id}`, {
            method: "PUT",
            body: JSON.stringify(data)
        }),
        delete: (id) => apiRequest(`/rooms/${id}`, {
            method: "DELETE"
        })
    },

    bookings: {
        getAll: () => apiRequest("/bookings"),
        create: (data) => apiRequest("/bookings", {
            method: "POST",
            body: JSON.stringify(data)
        }),
        updateStatus: (id, status) => apiRequest(`/bookings/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ booking_status: status })
        }),
        delete: (id) => apiRequest(`/bookings/${id}`, {
            method: "DELETE"
        })
    },

    billing: {
        getAll: () => apiRequest("/billing"),
        getById: (id) => apiRequest(`/billing/${id}`),
        create: (data) => apiRequest("/billing", {
            method: "POST",
            body: JSON.stringify(data)
        }),
        updatePayment: (id, status) => apiRequest(`/billing/${id}/payment`, {
            method: "PATCH",
            body: JSON.stringify({ payment_status: status })
        })
    },

    services: {
        getAll: () => apiRequest("/services"),
        create: (data) => apiRequest("/services", {
            method: "POST",
            body: JSON.stringify(data)
        }),
        updateStatus: (id, status) => apiRequest(`/services/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ order_status: status })
        }),
        delete: (id) => apiRequest(`/services/${id}`, {
            method: "DELETE"
        })
    },

    staff: {
        getAll: () => apiRequest("/staff"),
        getById: (id) => apiRequest(`/staff/${id}`),
        create: (data) => apiRequest("/staff", {
            method: "POST",
            body: JSON.stringify(data)
        }),
        update: (id, data) => apiRequest(`/staff/${id}`, {
            method: "PUT",
            body: JSON.stringify(data)
        }),
        delete: (id) => apiRequest(`/staff/${id}`, {
            method: "DELETE"
        })
    }
};

window.API = API;