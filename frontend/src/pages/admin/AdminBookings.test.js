import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { fetchDrivingRoute, reverseAddress } from '@/utils/bookingMap';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mockSearchParams = new URLSearchParams();
const mockMaps = {};

jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('@/components/BookingComments', () => () => null, { virtual: true });
jest.mock('@/components/InteractiveMap', () => () => <div />);
jest.mock('@/components/ReservationLocationFields', () => (props) => {
  mockMaps[props.idPrefix] = props.map;
  return <div data-testid={props.idPrefix} />;
});
jest.mock('@/utils/bookingMap', () => ({
  ...jest.requireActual('../../utils/bookingMap'),
  fetchDrivingRoute: jest.fn(),
  reverseAddress: jest.fn(),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }),
}), { virtual: true });
jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    useParams: () => ({ lang: 'fr' }),
    useSearchParams: () => [mockSearchParams],
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
jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props) => <textarea {...props} />,
}), { virtual: true });
jest.mock('@/components/ui/select', () => {
  const React = require('react');
  const Context = React.createContext(null);
  return {
    Select: ({ children, onValueChange }) => <Context.Provider value={onValueChange}>{children}</Context.Provider>,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem: ({ children, value }) => {
      const change = React.useContext(Context);
      return <button type="button" data-value={value} onClick={() => change?.(value)}>{children}</button>;
    },
    SelectTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
    SelectValue: ({ children }) => <div>{children}</div>,
  };
}, { virtual: true });
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
  getVehicleCategoryImageUrl: () => '/photo/chr.png',
  getVehicleCategoryPresentation: () => null,
  findPriceEstimateForCategory: () => null,
}), { virtual: true });
jest.mock('@/utils/invoiceGenerator', () => ({
  downloadInvoicePdf: jest.fn(),
}), { virtual: true });
jest.mock('@/utils/paymentUtils', () => ({
  formatPaymentMethodLabel: (value) => value || '—',
  normalizeEditablePaymentStatus: (value) => value || 'pending',
  normalizePaymentMethod: (value) => value || '',
  PAYMENT_METHOD_OPTIONS: [],
  PAYMENT_STATUS_OPTIONS: [
    { value: 'pending', label: 'En attente' },
    { value: 'partially_paid', label: 'Paiement partiel' },
    { value: 'paid', label: 'Payée' },
  ],
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
  const findButton = (text) => Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes(text));
  const pickup = { label: 'Paris', position: [48.85, 2.35] };
  const dropoff = { label: 'CDG', position: [49.01, 2.55] };
  const route = { positions: [pickup.position, dropoff.position], distanceKm: 28.5, durationMinutes: 36 };

  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockReset();
    axios.post.mockReset();
    axios.put.mockReset();
    fetchDrivingRoute.mockReset();
    reverseAddress.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('creates an admin booking with the same coordinate contract and preserves manual pricing/payment', async () => {
    axios.get.mockResolvedValue({ data: [] });
    axios.post.mockResolvedValue({ data: {} });
    fetchDrivingRoute.mockResolvedValue(route);
    reverseAddress.mockResolvedValueOnce(pickup).mockResolvedValueOnce(dropoff);
    await act(async () => root.render(<AdminBookings />));
    const fields = [
      container.querySelector('[data-testid="passenger-count-select"]'),
      container.querySelector('#admin-passengers-children'),
      container.querySelector('#admin-passengers-infants'),
      container.querySelector('[data-testid="baby-seat-count-select"]'),
      container.querySelector('#admin-passengers-boosters'),
    ];
    fields.forEach((field) => expect(field).not.toBeNull());
    fields.slice(1).forEach((field, index) => {
      expect(fields[index].compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    const setInput = (label, value) => {
      const paragraph = Array.from(container.querySelectorAll('p')).find((element) => element.textContent === label);
      const input = paragraph.parentElement.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => {
      setInput('Nom du client *', 'Client Test');
      setInput('Email du client *', 'client@example.com');
      setInput('Date de prise en charge *', '10/11/2026');
      setInput('Prix estimé (€)', '75');
      for (const [id, value] of [['admin-passengers-children', '1'], ['admin-passengers-infants', '1'], ['admin-passengers-boosters', '1']]) {
        const input = container.querySelector(`#${id}`);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      container.querySelector('[data-value="10:30"]').click();
    });
    await act(async () => container.querySelector('[data-testid="passenger-count-select"]').parentElement.querySelector('[data-value="4"]').click());
    await act(async () => container.querySelector('[data-testid="baby-seat-count-select"]').parentElement.querySelector('[data-value="1"]').click());
    expect(findButton('Créer la course').disabled).toBe(true);
    await act(async () => mockMaps['admin-create'].selectMapPosition(pickup.position));
    await act(async () => mockMaps['admin-create'].selectMapPosition(dropoff.position));
    expect(findButton('Créer la course').disabled).toBe(false);
    await act(async () => findButton('Créer la course').click());
    expect(axios.post).toHaveBeenCalledWith('http://api.test/api/admin/bookings', expect.objectContaining({
      pickup_address: 'Paris', dropoff_address: 'CDG',
      pickup_lat: 48.85, pickup_lng: 2.35, dropoff_lat: 49.01, dropoff_lng: 2.55,
      distance_km: 28.5, duration_minutes: 36, estimated_price: 75, payment_mode: 'deferred',
      passenger_count: 4, adult_count: 2, child_count: 1, infant_count: 1,
      baby_seat_count: 1, booster_seat_count: 1,
    }), expect.objectContaining({ withCredentials: true }));
  });

  it('restores saved coordinates for admin edits and invalidates them when typing', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/api/admin/bookings') ? [{
      id: 'booking-edit', client_name: 'Client', status: 'DRAFT', pickup_address: 'Paris',
      dropoff_address: 'CDG', pickup_lat: 48.85, pickup_lng: 2.35, dropoff_lat: 49.01, dropoff_lng: 2.55,
    }] : [] }));
    axios.put.mockResolvedValue({ data: {} });
    fetchDrivingRoute.mockResolvedValue(route);
    await act(async () => root.render(<AdminBookings />));
    await act(async () => findButton('Modifier').click());
    expect(mockMaps['admin-edit'].valid).toBe(true);
    await act(async () => findButton('Enregistrer les modifications').click());
    expect(axios.put).toHaveBeenCalledWith('http://api.test/api/admin/bookings/booking-edit', expect.objectContaining({
      pickup_lat: 48.85, pickup_lng: 2.35, dropoff_lat: 49.01, dropoff_lng: 2.55,
      distance_km: 28.5, duration_minutes: 36,
    }), expect.any(Object));
    await act(async () => mockMaps['admin-edit'].changeAddress('pickup', 'Orly'));
    expect(findButton('Enregistrer les modifications').disabled).toBe(true);
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
            passenger_count: 3,
            baby_seat_count: 2,
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
    expect(container.textContent).toContain('Passagers : 3');
    expect(container.textContent).toContain('Sièges bébé : 2');
  });

  it('shows the payment received button and remaining balance for completed unpaid bookings', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/admin/bookings')) {
        return Promise.resolve({
          data: [{
            id: 'booking-2',
            client_name: 'Client Partiel',
            client_email: 'client-partiel@test.com',
            pickup_date: '24/09/2026',
            pickup_time: '11:00',
            pickup_address: 'Paris',
            dropoff_address: 'Rouen',
            status: 'COMPLETED',
            payment_status: 'partially_paid',
            payment_method: 'virement',
            estimated_price: 120,
            paid_amount: 40,
            remaining_amount: 80,
          }],
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

    expect(container.textContent).toContain('Paiement partiel');
    expect(container.textContent).toContain('Reçu client: 40.00 €');
    expect(container.textContent).toContain('Reste à payer: 80.00 €');
    expect(container.querySelector('[data-testid="payment-received-btn-booking-2"]')).not.toBeNull();
  });

  it('keeps partially paid bookings in the awaiting payment filter', async () => {
    mockSearchParams = new URLSearchParams('status=awaiting_payment');
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/admin/bookings')) {
        return Promise.resolve({
          data: [
            {
              id: 'booking-partial',
              client_name: 'Client Partiel',
              client_email: 'client-partiel@test.com',
              pickup_date: '24/09/2026',
              pickup_time: '11:00',
              pickup_address: 'Paris',
              dropoff_address: 'Rouen',
              status: 'INVOICED',
              payment_status: 'partially_paid',
              payment_method: 'virement',
            },
            {
              id: 'booking-paid',
              client_name: 'Client Soldé',
              client_email: 'client-solde@test.com',
              pickup_date: '24/09/2026',
              pickup_time: '12:00',
              pickup_address: 'Lille',
              dropoff_address: 'Paris',
              status: 'PAID',
              payment_status: 'paid',
              payment_method: 'cb',
            },
          ],
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

    expect(container.textContent).toContain('Client Partiel');
    expect(container.textContent).not.toContain('Client Soldé');
  });
});
