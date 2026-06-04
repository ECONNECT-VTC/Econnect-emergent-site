import { act } from 'react';
import { createRoot } from 'react-dom/client';
import BookingPaymentSuccess from './BookingPaymentSuccess';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockClearBookingCheckoutDraft = jest.fn();
const mockConfirmBookingPayment = jest.fn();

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    useParams: () => ({ lang: 'fr' }),
    useSearchParams: () => [new URLSearchParams('booking_id=booking_1&session_id=cs_test_1')],
  };
}, { virtual: true });

jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('@/utils/bookingCheckout', () => ({
  clearBookingCheckoutDraft: (...args) => mockClearBookingCheckoutDraft(...args),
  confirmBookingPayment: (...args) => mockConfirmBookingPayment(...args),
}), { virtual: true });

describe('BookingPaymentSuccess', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockClearBookingCheckoutDraft.mockReset();
    mockConfirmBookingPayment.mockReset();
    mockConfirmBookingPayment.mockResolvedValue({
      verified: true,
      booking: {
        id: 'booking_1',
        client_id: 'u1',
        client_name: 'Client Test',
        client_email: 'client@test.com',
        pickup_address: 'Paris',
        dropoff_address: 'CDG',
        pickup_date: '20/06/2026',
        pickup_time: '10:30',
        transfer_type: 'simple',
        status: 'received',
        payment_status: 'paid',
        estimated_price: 120,
        paid_amount: 120,
        created_at: '2026-06-04T20:00:00Z',
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('confirms payment and clears the draft on mount', async () => {
    await act(async () => {
      root.render(<BookingPaymentSuccess />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockClearBookingCheckoutDraft).toHaveBeenCalledTimes(1);
    expect(mockConfirmBookingPayment).toHaveBeenCalledWith('booking_1', 'cs_test_1');
    expect(container.textContent).toContain('Paiement confirmé');
    expect(container.textContent).toContain('#booking_1');
  });
});
