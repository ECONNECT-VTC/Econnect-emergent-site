import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('@/components/BookingComments', () => () => null, { virtual: true });
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }),
}), { virtual: true });
jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    useParams: () => ({ lang: 'fr' }),
    useSearchParams: () => [new URLSearchParams()],
  };
}, { virtual: true });
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}), { virtual: true });
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}), { virtual: true });
jest.mock('@/components/ui/input', () => {
  const React = require('react');
  return {
    Input: React.forwardRef((props, ref) => <input {...props} ref={ref} />),
  };
}, { virtual: true });
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ children }) => <div>{children}</div>,
}), { virtual: true });
jest.mock('@phosphor-icons/react', () => ({
  CalendarCheck: () => null,
  CarSimple: () => null,
  CheckCircle: () => null,
  MapPin: () => null,
  User: () => null,
  DownloadSimple: () => null,
}), { virtual: true });
jest.mock('@/utils/vehicleCategories', () => ({
  getCategoryDisplayName: (value) => value,
}), { virtual: true });
jest.mock('@/utils/invoiceGenerator', () => ({
  downloadInvoicePdf: jest.fn(),
}), { virtual: true });
jest.mock('@/utils/paymentUtils', () => ({
  formatPaymentMethodLabel: (value) => value || '—',
  normalizeEditablePaymentStatus: (value) => value || 'pending',
  normalizePaymentMethod: (value) => value || '',
  PAYMENT_METHOD_OPTIONS: [],
  PAYMENT_STATUS_OPTIONS: [{ value: 'pending', label: 'En attente' }],
}), { virtual: true });
jest.mock('./adminBookingUtils', () => ({
  buildAdminEstimatePriceQuery: () => null,
  toOptionalNumber: (value) => (value == null ? null : Number(value)),
}), { virtual: true });
jest.mock('../../utils/courseWorkflow', () => ({
  COURSE_STATUS_LABELS: { ASSIGNED: 'Assignée', COMPLETED: 'Terminée', QUOTE_ACCEPTED: 'Validée' },
  COURSE_STATUS_STYLES: { ASSIGNED: '', COMPLETED: '', QUOTE_ACCEPTED: '' },
  isStatusAtOrAfter: () => false,
  normalizeCourseStatus: (value) => value,
  statusEquals: (value, expected) => String(value).toUpperCase() === String(expected).toUpperCase(),
}), { virtual: true });

const AdminBookings = require('./AdminBookings').default;

describe('AdminBookings', () => {
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

  it('keeps reservations visible when a secondary endpoint fails', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/admin/bookings')) {
        return Promise.resolve({
          data: [{
            id: 'booking-1',
            client_name: 'Client Test',
            pickup_date: '24/09/2026',
            pickup_time: '10:00',
            pickup_address: 'Paris',
            dropoff_address: 'Lyon',
            status: 'ASSIGNED',
            payment_status: 'pending',
            payment_method: 'card',
          }],
        });
      }
      if (url.includes('/api/admin/drivers')) {
        return Promise.reject({
          response: {
            data: { detail: 'Drivers endpoint failed' },
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => {
      root.render(<AdminBookings />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Drivers endpoint failed');
    expect(container.textContent).toContain('Paris');
    expect(container.textContent).toContain('Lyon');
  });
});
