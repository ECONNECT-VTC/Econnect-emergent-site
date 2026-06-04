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

export const buildBookingCheckoutResumeState = (lang = 'fr', currentState = null, draft = null) => {
  if (currentState?.from?.pathname) {
    return currentState;
  }

  if (draft?.autoPayAfterAuth && draft?.checkoutPayload) {
    return {
      from: {
        pathname: `/${lang}`,
        hash: '#reserver',
      },
    };
  }

  return currentState || null;
};

export const getBookingCheckoutResumeState = (lang = 'fr', currentState = null) =>
  buildBookingCheckoutResumeState(lang, currentState, readBookingCheckoutDraft());

export const createCheckoutSession = async (payload) => {
  const response = await axios.post(`${API_URL}/api/bookings/checkout`, payload, {
    withCredentials: true,
  });
  return response.data;
};

export const confirmBookingPayment = async (bookingId, sessionId) => {
  const response = await axios.post(
    `${API_URL}/api/bookings/${bookingId}/confirm-payment`,
    { session_id: sessionId },
    { withCredentials: true }
  );
  return response.data;
};
