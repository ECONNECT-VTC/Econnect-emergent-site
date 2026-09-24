import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}), { virtual: true });
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}), { virtual: true });
jest.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}), { virtual: true });

const AdminFinancialDashboard = require('./AdminFinancialDashboard').default;

describe('AdminFinancialDashboard', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders financial data even if the drivers endpoint fails', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/admin/financial/stats')) {
        return Promise.resolve({
          data: {
            total_revenue_ttc: 120,
            total_revenue_ht: 100,
            total_tva_client: 20,
            total_commission_ttc: 12,
            total_tva_commission: 2,
            total_driver_earnings: 108,
            commission_rate: 0.1,
          },
        });
      }
      if (url.includes('/api/admin/bookings?status=completed')) {
        return Promise.resolve({
          data: [{
            id: 'booking-1',
            client_name: 'Client Test',
            driver_name: 'Driver Test',
            pickup_address: 'Paris',
            dropoff_address: 'Lyon',
            pickup_date: '24/09/2026',
            pickup_time: '10:00',
            estimated_price: 120,
          }],
        });
      }
      if (url.includes('/api/admin/drivers')) {
        return Promise.reject({
          response: {
            status: 503,
            statusText: 'Service Unavailable',
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => {
      root.render(<AdminFinancialDashboard />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('HTTP 503 — Service Unavailable');
    expect(container.textContent).toContain('120.00€');
    expect(container.textContent).toContain('Client Test');
  });

  it('keeps driver earnings based on the full booking amount even when the client paid partially', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/admin/financial/stats')) {
        return Promise.resolve({
          data: {
            total_revenue_ttc: 120,
            total_revenue_ht: 100,
            total_tva_client: 20,
            total_commission_ttc: 12,
            total_tva_commission: 2,
            total_driver_earnings: 108,
            commission_rate: 0.1,
          },
        });
      }
      if (url.includes('/api/admin/bookings?status=completed')) {
        return Promise.resolve({
          data: [{
            id: 'booking-partial',
            client_name: 'Client Partiel',
            driver_name: 'Driver Test',
            pickup_address: 'Paris',
            dropoff_address: 'Lyon',
            pickup_date: '24/09/2026',
            pickup_time: '10:00',
            estimated_price: 120,
            payment_status: 'partially_paid',
            paid_amount: 30,
          }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => {
      root.render(<AdminFinancialDashboard />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('108.00€');
  });
});
