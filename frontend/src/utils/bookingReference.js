export const formatBookingReference = (id) => String(id || '').trim().slice(0, 6).toUpperCase();
