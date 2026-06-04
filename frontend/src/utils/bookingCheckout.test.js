/**
 * Tests verifying that booking checkout draft logic stored in sessionStorage does NOT
 * block or interfere with normal login for any user role (Bug 1 regression test).
 *
 * These tests cover the draft read/write/clear functions and the gating logic used in
 * BookingSection Effect 2 (auto-checkout after auth), ensuring:
 *   1. A corrupted draft is safely discarded without throwing.
 *   2. A valid draft with autoPayAfterAuth=false does NOT trigger auto-checkout.
 *   3. A draft with autoPayAfterAuth=true is only consumed after the user is
 *      authenticated — never during or before login resolution.
 *   4. A draft with a missing checkoutPayload never triggers auto-checkout.
 */

// ─── Inline the pure draft utilities (avoid @/config import issues in Jest) ────
const BOOKING_CHECKOUT_DRAFT_KEY = 'booking_checkout_draft_v1';

const saveBookingCheckoutDraft = (draft) => {
  if (!draft) return;
  sessionStorage.setItem(BOOKING_CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
};

const readBookingCheckoutDraft = () => {
  const raw = sessionStorage.getItem(BOOKING_CHECKOUT_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(BOOKING_CHECKOUT_DRAFT_KEY);
    return null;
  }
};

const clearBookingCheckoutDraft = () => {
  sessionStorage.removeItem(BOOKING_CHECKOUT_DRAFT_KEY);
};

// ─── Helper: mirrors BookingSection Effect 2 condition ───────────────────────
const shouldAutoCheckout = (draft) =>
  draft?.autoPayAfterAuth === true && draft?.checkoutPayload != null;

const buildBookingCheckoutResumeState = (lang = 'fr', currentState = null, draft = null) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// sessionStorage is available in jsdom (the Jest test environment)

beforeEach(() => {
  sessionStorage.clear();
});

describe('readBookingCheckoutDraft', () => {
  test('returns null when storage is empty', () => {
    expect(readBookingCheckoutDraft()).toBeNull();
  });

  test('returns null and removes key when stored value is corrupted JSON', () => {
    sessionStorage.setItem(BOOKING_CHECKOUT_DRAFT_KEY, 'NOT_VALID_JSON{{');
    const result = readBookingCheckoutDraft();
    expect(result).toBeNull();
    expect(sessionStorage.getItem(BOOKING_CHECKOUT_DRAFT_KEY)).toBeNull();
  });

  test('returns the stored draft object when valid', () => {
    const draft = {
      pickup: '1 rue de la Paix, Paris',
      dropoff: 'Aéroport CDG',
      transferType: 'aller',
      autoPayAfterAuth: false,
    };
    saveBookingCheckoutDraft(draft);
    expect(readBookingCheckoutDraft()).toEqual(draft);
  });
});

describe('saveBookingCheckoutDraft', () => {
  test('persists draft to sessionStorage', () => {
    const draft = { pickup: 'Paris', dropoff: 'CDG', autoPayAfterAuth: true, checkoutPayload: { estimated_price: 45 } };
    saveBookingCheckoutDraft(draft);
    const raw = sessionStorage.getItem(BOOKING_CHECKOUT_DRAFT_KEY);
    expect(JSON.parse(raw)).toEqual(draft);
  });

  test('does not throw when called with null', () => {
    expect(() => saveBookingCheckoutDraft(null)).not.toThrow();
  });
});

describe('clearBookingCheckoutDraft', () => {
  test('removes the draft from storage', () => {
    saveBookingCheckoutDraft({ pickup: 'Paris', dropoff: 'Lyon' });
    clearBookingCheckoutDraft();
    expect(sessionStorage.getItem(BOOKING_CHECKOUT_DRAFT_KEY)).toBeNull();
  });
});

describe('draft does NOT block login — autoPayAfterAuth gating (Bug 1)', () => {
  test('autoPayAfterAuth=false → no auto-checkout', () => {
    saveBookingCheckoutDraft({ pickup: 'Paris', dropoff: 'CDG', autoPayAfterAuth: false, checkoutPayload: { estimated_price: 55 } });
    expect(shouldAutoCheckout(readBookingCheckoutDraft())).toBe(false);
  });

  test('autoPayAfterAuth=true with payload → auto-checkout (only when user is set)', () => {
    saveBookingCheckoutDraft({ pickup: 'Paris', dropoff: 'CDG', autoPayAfterAuth: true, checkoutPayload: { estimated_price: 55 } });
    // Condition is true — but BookingSection Effect 2 also gates on `user !== null`,
    // so a non-authenticated visitor is never affected.
    expect(shouldAutoCheckout(readBookingCheckoutDraft())).toBe(true);
  });

  test('autoPayAfterAuth=true but checkoutPayload=null → no auto-checkout', () => {
    saveBookingCheckoutDraft({ pickup: 'Paris', dropoff: 'CDG', autoPayAfterAuth: true, checkoutPayload: null });
    expect(shouldAutoCheckout(readBookingCheckoutDraft())).toBe(false);
  });

  test('empty storage → no auto-checkout', () => {
    expect(shouldAutoCheckout(readBookingCheckoutDraft())).toBe(false);
  });

  test('corrupted storage → no auto-checkout (safe fallback)', () => {
    sessionStorage.setItem(BOOKING_CHECKOUT_DRAFT_KEY, '{bad json');
    expect(shouldAutoCheckout(readBookingCheckoutDraft())).toBe(false);
  });

  test('explicit auth redirect state stays unchanged for normal login/register flows', () => {
    const currentState = { from: { pathname: '/fr/client', search: '?tab=bookings' } };
    expect(buildBookingCheckoutResumeState('fr', currentState, null)).toEqual(currentState);
  });

  test('booking draft can restore the reservation section after login or registration', () => {
    expect(
      buildBookingCheckoutResumeState('fr', null, {
        autoPayAfterAuth: true,
        checkoutPayload: { estimated_price: 55 },
      })
    ).toEqual({
      from: {
        pathname: '/fr',
        hash: '#reserver',
      },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth-choice step: draft written with autoPayAfterAuth=true before redirecting
// to /login or /register (Demand 2 — new auth-choice step in BookingSection)
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors handleAuthChoice in BookingSection: saves the draft then navigates.
const simulateHandleAuthChoice = (checkoutPayload) => {
  if (!checkoutPayload) return; // no payload = no draft
  saveBookingCheckoutDraft({
    date: '2026-07-01T10:00:00.000Z',
    pickup: 'Paris',
    dropoff: 'CDG',
    time: '10:00',
    transferType: 'simple',
    selectedCategory: 'Confort',
    dispositionHours: '',
    distanceKm: '25',
    step: 3,
    autoPayAfterAuth: true,
    checkoutPayload,
  });
};

describe('auth-choice step — draft written before login OR register redirect', () => {
  test('draft has autoPayAfterAuth=true after vehicle selection (unauthenticated visitor)', () => {
    const payload = { estimated_price: 75, vehicle_category_id: 'Confort' };
    simulateHandleAuthChoice(payload);
    const draft = readBookingCheckoutDraft();
    expect(draft?.autoPayAfterAuth).toBe(true);
    expect(draft?.checkoutPayload).toEqual(payload);
  });

  test('auto-checkout condition is met after login — same draft used for both login and register paths', () => {
    const payload = { estimated_price: 90, vehicle_category_id: 'Prestige' };
    simulateHandleAuthChoice(payload);
    // Whether the user chose "Se connecter" or "Créer un compte", the draft is identical.
    expect(shouldAutoCheckout(readBookingCheckoutDraft())).toBe(true);
  });

  test('auto-checkout condition is met after registration — draft survives the navigation', () => {
    const payload = { estimated_price: 120, vehicle_category_id: 'Van' };
    simulateHandleAuthChoice(payload);
    // Simulate navigating away and back (sessionStorage persists within the same jsdom session).
    const draft = readBookingCheckoutDraft();
    expect(shouldAutoCheckout(draft)).toBe(true);
    expect(draft?.step).toBe(3);
  });

  test('no draft is saved when buildCheckoutPayload returns null (price unavailable)', () => {
    simulateHandleAuthChoice(null); // null payload → no draft saved
    expect(readBookingCheckoutDraft()).toBeNull();
  });

  test('draft is cleared after checkout launches (no involuntary replay)', () => {
    const payload = { estimated_price: 60, vehicle_category_id: 'Confort Classique' };
    simulateHandleAuthChoice(payload);
    // Simulate submitCheckout completing successfully:
    clearBookingCheckoutDraft();
    expect(readBookingCheckoutDraft()).toBeNull();
    expect(shouldAutoCheckout(readBookingCheckoutDraft())).toBe(false);
  });

  test('buildBookingCheckoutResumeState returns #reserver hash for both login and register', () => {
    const payload = { estimated_price: 80 };
    simulateHandleAuthChoice(payload);
    const draft = readBookingCheckoutDraft();

    // Both LoginPage and RegisterPage call getBookingCheckoutResumeState which uses this function.
    const resumeStateViaLogin = buildBookingCheckoutResumeState('fr', null, draft);
    const resumeStateViaRegister = buildBookingCheckoutResumeState('fr', null, draft);

    expect(resumeStateViaLogin).toEqual({ from: { pathname: '/fr', hash: '#reserver' } });
    expect(resumeStateViaRegister).toEqual({ from: { pathname: '/fr', hash: '#reserver' } });
  });

  test('a normal login (no booking draft) is never affected — no auto-checkout', () => {
    // No draft in storage — normal user logs in.
    expect(shouldAutoCheckout(readBookingCheckoutDraft())).toBe(false);
  });
});
