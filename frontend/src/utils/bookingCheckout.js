import axios from 'axios';
import API_URL from '@/config';

export const BOOKING_CHECKOUT_DRAFT_KEY = 'booking_checkout_draft_v1';

export const saveBookingCheckoutDraft = (draft) => {
  if (!draft) return;
  sessionStorage.setItem(BOOKING_CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
};

export const readBookingCheckoutDraft = () => {
  const raw = sessionStorage.getItem(BOOKING_CHECKOUT_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    sessionStorage.removeItem(BOOKING_CHECKOUT_DRAFT_KEY);
    return null;
  }
};

export const clearBookingCheckoutDraft = () => {
  sessionStorage.removeItem(BOOKING_CHECKOUT_DRAFT_KEY);
};

export const createCheckoutSession = async (payload) => {
  const response = await axios.post(`${API_URL}/api/bookings/checkout`, payload, {
    withCredentials: true,
  });
  return response.data;
};
