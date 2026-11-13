import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { useDriverInvoices, useInvoices } from './useInvoices';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });

describe('invoice summaries', () => {
  let container;
  let root;
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it('uses the authoritative admin totals, not the paginated initial-invoice rows', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/stats')
      ? { total_revenue_ttc: 120, total_commission_ttc: 12, total_driver_earnings: 108, completed_bookings_count: 2 }
      : [{ id: 'one', price_ttc: 10, commission_ttc: 1, driver_earning: 9 }] }));
    function Summary() {
      const { stats, error } = useInvoices();
      return <p>{JSON.stringify({ stats, error })}</p>;
    }
    await act(async () => root.render(<Summary />));
    const result = JSON.parse(container.textContent);
    expect(result.stats).toEqual({ totalClient: 120, totalCommission: 12, totalDriver: 108, count: 2 });
    expect(result.error).toBe('');
  });

  it('adds only the net supplementary driver share to the initial course earnings', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/supplementary-invoices')
      ? { totals: { driver_cents: 1800 } } : [{ booking_id: 'one', driver_earning: 90 }] }));
    function Summary() {
      const { totalEarned, error } = useDriverInvoices();
      return <p>{JSON.stringify({ totalEarned, error })}</p>;
    }
    await act(async () => root.render(<Summary />));
    expect(JSON.parse(container.textContent)).toEqual({ totalEarned: 108, error: '' });
  });
});
