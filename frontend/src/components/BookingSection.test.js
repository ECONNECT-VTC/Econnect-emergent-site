import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let lastCalendarProps = null;
const mockReadBookingCheckoutDraft = jest.fn();

jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('date-fns', () => ({ format: () => '24/09/2026' }), { virtual: true });
jest.mock('date-fns/locale', () => ({ fr: {} }), { virtual: true });
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}), { virtual: true });
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'client@test.com' } }),
}), { virtual: true });
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ hash: '' }),
  useNavigate: () => jest.fn(),
  useParams: () => ({ lang: 'fr' }),
}), { virtual: true });
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}), { virtual: true });
jest.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}), { virtual: true });
jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}), { virtual: true });
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}), { virtual: true });
jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }) => <div>{children}</div>,
  PopoverTrigger: ({ children }) => <div>{children}</div>,
  PopoverContent: ({ children }) => <div>{children}</div>,
}), { virtual: true });
jest.mock('@/components/ui/calendar', () => ({
  Calendar: (props) => {
    lastCalendarProps = props;
    return <div data-testid="calendar-component" />;
  },
}), { virtual: true });
jest.mock('./InteractiveMap', () => () => <div />, { virtual: true });
jest.mock('@/components/VehicleFeatureBadges', () => ({
  PremiumWifiIcon: () => null,
}), { virtual: true });
jest.mock('@/utils/vehicleCategories', () => {
  const actual = jest.requireActual('../utils/vehicleCategories');
  return actual;
}, { virtual: true });
jest.mock('@/utils/bookingCheckout', () => ({
  createCheckoutSession: jest.fn(),
  clearBookingCheckoutDraft: jest.fn(),
  readBookingCheckoutDraft: (...args) => mockReadBookingCheckoutDraft(...args),
  saveBookingCheckoutDraft: jest.fn(),
}), { virtual: true });
jest.mock('framer-motion', () => {
  const React = require('react');
  const stripMotionProps = ({ initial, animate, exit, transition, whileInView, viewport, ...props }) => props;
  const motion = new Proxy({}, {
    get: (_, tag) => ({ children, ...props }) => React.createElement(tag, stripMotionProps(props), children),
  });
  return {
    motion,
    AnimatePresence: ({ children }) => <>{children}</>,
  };
}, { virtual: true });
jest.mock('@phosphor-icons/react', () => ({
  ArrowRight: () => null,
  Briefcase: () => null,
  Calendar: () => null,
  CarSimple: () => null,
  Clock: () => null,
  Lock: () => null,
  MapPin: () => null,
  Timer: () => null,
  Users: () => null,
}), { virtual: true });

const BookingSection = require('./BookingSection').default;

describe('BookingSection', () => {
  let container;
  let root;

  beforeEach(() => {
    lastCalendarProps = null;
    mockReadBookingCheckoutDraft.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockReset();
    axios.post.mockReset();
    axios.get.mockResolvedValue({
      data: [
        { id: 'berline-id', name: 'Berline', min_fare: 30, price_per_km: 2.5 },
        { id: 'green-id', name: 'Green', min_fare: 55, price_per_km: 3.1 },
      ],
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('allows selecting past dates on the public booking calendar', async () => {
    mockReadBookingCheckoutDraft.mockReturnValue(null);

    await act(async () => {
      root.render(<BookingSection />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastCalendarProps?.disabled).toBeUndefined();
  });

  it('shows the 20% deposit notice for transfer and cash bookings', async () => {
    mockReadBookingCheckoutDraft.mockReturnValue({
      step: 3,
      date: '2026-09-24T10:00:00.000Z',
      pickup: 'Paris',
      dropoff: 'CDG',
      time: '10:30',
      transferType: 'simple',
      selectedCategory: 'Berline',
      paymentMethod: 'virement',
      distanceKm: '25',
      checkoutPayload: {},
    });
    axios.post.mockResolvedValue({
      data: [{ category_id: 'berline-id', category_name: 'Berline', final_price: 80, min_fare: 30 }],
    });

    await act(async () => {
      root.render(<BookingSection />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('20% du montant de la course sera payé maintenant');
    expect(container.textContent).toContain('Payer l’acompte et confirmer');
  });
});
