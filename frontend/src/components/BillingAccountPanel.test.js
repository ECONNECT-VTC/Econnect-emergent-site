import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import BillingAccountPanel from './BillingAccountPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });

describe('account supplementary billing', () => {
  let container;
  let root;
  const invoice = {
    id: 'invoice', booking_id: 'booking', invoice_number: '000002', amount_ttc_cents: 2000,
    paid_cents: 700, remaining_cents: 1300, driver_cents: 1800, commission_cents: 200,
  };
  const button = (text) => [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it('loads only the client booking invoices on request and shows the separate balance', async () => {
    axios.get.mockResolvedValue({ data: [invoice] });
    await act(async () => root.render(<BillingAccountPanel role="client" bookingId="booking" />));
    expect(axios.get).not.toHaveBeenCalled();
    await act(async () => button('Factures et avoirs complémentaires').click());
    expect(axios.get).toHaveBeenCalledWith(
      'http://api.test/api/billing/bookings/booking/invoices', expect.objectContaining({ withCredentials: true }),
    );
    expect(container.textContent).toContain('Solde');
    expect(button('Payer le solde via Stripe')).toBeDefined();
    expect(button('PDF commission')).toBeUndefined();
  });

  it('never offers to pay a credited invoice', async () => {
    axios.get.mockResolvedValue({ data: [{ ...invoice, credit: { invoice_number: '000004', reason: 'Correction' }, remaining_cents: 0 }] });
    await act(async () => root.render(<BillingAccountPanel role="client" bookingId="booking" />));
    await act(async () => button('Factures et avoirs complémentaires').click());
    expect(container.textContent).toContain('Avoir intégral n° 000004');
    expect(button('Payer le solde via Stripe')).toBeUndefined();
    expect(button('PDF avoir')).toBeDefined();
  });

  it('offers only partner documents to drivers, not client checkout', async () => {
    axios.get.mockResolvedValue({ data: {
      totals: { driver_cents: 1800, commission_cents: 200 }, invoices: [invoice],
    } });
    await act(async () => root.render(<BillingAccountPanel role="driver" />));
    await act(async () => button('Frais et documents complémentaires').click());
    expect(button('PDF relevé chauffeur')).toBeDefined();
    expect(button('PDF commission')).toBeDefined();
    expect(button('PDF facture')).toBeUndefined();
    expect(button('Payer le solde via Stripe')).toBeUndefined();
  });

  it('passes the admin driver filter and makes failed loads explicit', async () => {
    axios.get.mockRejectedValue({ response: { status: 403, data: { detail: 'Accès refusé' } } });
    await act(async () => root.render(<BillingAccountPanel role="admin" driverId="driver&one" />));
    await act(async () => button('Factures et avoirs complémentaires').click());
    expect(axios.get.mock.calls[0][0]).toContain('driver_id=driver%26one');
    expect(container.querySelector('[role="alert"]').textContent).toContain('Accès refusé');
    expect(button('Payer le solde via Stripe')).toBeUndefined();
  });
});
