import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { fetchDrivingRoute, reverseAddress } from '@/utils/bookingMap';
import { createCheckoutSession, saveBookingCheckoutDraft } from '@/utils/bookingCheckout';
import { useAuth } from '@/contexts/AuthContext';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let lastCalendarProps = null;
const mockReadBookingCheckoutDraft = jest.fn();
let mockMapProps;
const mockNavigate = jest.fn();

jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('date-fns', () => ({ format: () => '24/09/2026' }), { virtual: true });
jest.mock('date-fns/locale', () => ({ fr: {} }), { virtual: true });
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}), { virtual: true });
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({ user: { id: 'u1', email: 'client@test.com' } })),
}), { virtual: true });
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ hash: '' }),
  useNavigate: () => mockNavigate,
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
jest.mock('./InteractiveMap', () => (props) => { mockMapProps = props; return <div />; }, { virtual: true });
jest.mock('@/utils/bookingMap', () => ({
  ...jest.requireActual('../utils/bookingMap'),
  fetchDrivingRoute: jest.fn(),
  reverseAddress: jest.fn(),
}));
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
  const components = {};
  const motion = new Proxy({}, {
    get: (_, tag) => {
      if (!components[tag]) components[tag] = ({ children, ...props }) => React.createElement(tag, stripMotionProps(props), children);
      return components[tag];
    },
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
    useAuth.mockReturnValue({ user: { id: 'u1', email: 'client@test.com' } });
    mockNavigate.mockClear();
    lastCalendarProps = null;
    mockReadBookingCheckoutDraft.mockReset();
    fetchDrivingRoute.mockReset();
    reverseAddress.mockReset();
    createCheckoutSession.mockReset();
    saveBookingCheckoutDraft.mockClear();
    HTMLElement.prototype.scrollIntoView = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockReset();
    axios.post.mockReset();
    axios.get.mockImplementation((url) => Promise.resolve(url.endsWith('/api/booking-terms') ? {
      data: { enabled: false, version: '2026-11-04', title: 'CGV', sections: [] },
    } : {
      data: [
        { id: 'berline-id', name: 'Berline', min_fare: 30, price_per_km: 2.5 },
        { id: 'green-id', name: 'Green', min_fare: 55, price_per_km: 3.1 },
      ],
    }));
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

  it('uses map-selected addresses and driving metrics for public pricing, checkout and drafts', async () => {
    const get = axios.get.getMockImplementation();
    axios.get.mockImplementation((url, options) => url.endsWith('/api/booking-terms')
      ? Promise.resolve({ data: { enabled: true, version: '2026-11-04', title: 'CGV', sections: [] } })
      : get(url, options));
    const pickup = { label: 'Gare du Nord, Paris', position: [48.88, 2.35] };
    const dropoff = { label: 'Aéroport CDG', position: [49.01, 2.55] };
    const route = { distanceKm: 28.5, durationMinutes: 36, positions: [pickup.position, dropoff.position] };
    mockReadBookingCheckoutDraft.mockReturnValue({
      step: 1, date: '2026-11-10T10:00:00.000Z', time: '10:30', transferType: 'simple',
      passengerCount: '3', childCount: '1', infantCount: '1', babySeatCount: '1', boosterCount: '1',
    });
    reverseAddress.mockResolvedValueOnce(pickup).mockResolvedValueOnce(dropoff);
    fetchDrivingRoute.mockResolvedValue(route);
    axios.post.mockResolvedValue({ data: [{ category_name: 'Berline', final_price: 75 }] });
    createCheckoutSession.mockRejectedValue({
      response: { status: 422, data: { detail: [{
        loc: ['body', 'terms_version'], msg: 'La version des CGV a changé.',
      }] } },
    });
    await act(async () => root.render(<BookingSection />));
    await act(async () => mockMapProps.onSelectPosition(pickup.position));
    await act(async () => mockMapProps.onSelectPosition(dropoff.position));
    expect(container.querySelector('[data-testid="pickup-input"]').value).toBe(pickup.label);
    expect(container.querySelector('[data-testid="dropoff-input"]').value).toBe(dropoff.label);
    expect(container.querySelector('[data-testid="distance-km-input"]').value).toBe('28.5');
    expect(container.querySelector('[data-testid="distance-km-input"]').readOnly).toBe(true);
    const query = new URL(axios.post.mock.calls.at(-1)[0]).searchParams;
    expect(query.get('distance_km')).toBe('28.5');
    expect(query.get('duration_minutes')).toBe('36');
    await act(async () => container.querySelector('[data-testid="booking-form"]').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    ));
    await act(async () => container.querySelector('[data-testid="vehicle-cat-Berline"]').click());
    const fields = [
      container.querySelector('[data-testid="passenger-count-select"]'),
      container.querySelector('#public-passengers-children'),
      container.querySelector('#public-passengers-infants'),
      container.querySelector('[data-testid="baby-seat-count-select"]'),
      container.querySelector('#public-passengers-boosters'),
    ];
    fields.forEach((field) => expect(field).not.toBeNull());
    fields.slice(1).forEach((field, index) => {
      expect(fields[index].compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    await act(async () => container.querySelector('[data-testid="continue-booking-step-3"]').closest('form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    ));
    await act(async () => container.querySelector('[data-testid="booking-confirmation-form"]').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    ));
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="booking-terms-acceptance"]').checked).toBe(false);
    await act(async () => container.querySelector('[data-testid="booking-terms-acceptance"]').click());
    await act(async () => container.querySelector('[data-testid="booking-confirmation-form"]').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    ));
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      terms_accepted: true, terms_version: '2026-11-04',
      pickup_lat: pickup.position[0], pickup_lng: pickup.position[1],
      dropoff_lat: dropoff.position[0], dropoff_lng: dropoff.position[1],
      pickup_address: pickup.label, dropoff_address: dropoff.label,
      distance_km: 28.5, duration_minutes: 36, estimated_price: 75,
      passenger_count: 3, adult_count: 1, child_count: 1, infant_count: 1,
      baby_seat_count: 1, booster_seat_count: 1,
    }));
    expect(saveBookingCheckoutDraft).toHaveBeenCalledWith(expect.objectContaining({
      mapAddresses: { pickup, dropoff }, durationMinutes: '36', childCount: '1', infantCount: '1', boosterCount: '1',
    }));
    expect(container.querySelector('[data-testid="booking-checkout-error"]').textContent).toContain('La version des CGV a changé.');
    expect(container.querySelector('[data-testid="booking-terms-acceptance"]').checked).toBe(false);
  });

  it('reports pricing failure and does not charge a minimum fare as a route estimate', async () => {
    mockReadBookingCheckoutDraft.mockReturnValue({
      step: 2, date: '2026-11-10T10:00:00.000Z', time: '10:30', transferType: 'simple',
      pickup: 'Paris', dropoff: 'CDG', distanceKm: '28.5', selectedCategory: 'Berline',
    });
    axios.post.mockRejectedValue(new Error('Pricing unavailable'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => root.render(<BookingSection />));
    expect(container.querySelector('[role="alert"]').textContent).toContain('Impossible de calculer les tarifs');
    expect(container.querySelector('[data-testid="continue-booking-step-3"]').disabled).toBe(true);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('blocks an old checkout draft without geocoded addresses after authentication', async () => {
    mockReadBookingCheckoutDraft.mockReturnValue({
      autoPayAfterAuth: true, step: 3,
      checkoutPayload: { pickup_address: 'Paris', dropoff_address: 'CDG', estimated_price: 75 },
    });
    await act(async () => root.render(<BookingSection />));
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain('adresses géolocalisées');
    expect(container.querySelector('[data-testid="booking-form"]')).not.toBeNull();
  });

  it('does not auto-pay an authenticated draft with an obsolete terms version', async () => {
    const get = axios.get.getMockImplementation();
    axios.get.mockImplementation((url, options) => url.endsWith('/api/booking-terms')
      ? Promise.resolve({ data: { enabled: true, version: '2026-11-04', title: 'CGV', sections: [] } })
      : get(url, options));
    mockReadBookingCheckoutDraft.mockReturnValue({
      autoPayAfterAuth: true, step: 3,
      checkoutPayload: {
        pickup_address: 'Paris', dropoff_address: 'CDG', estimated_price: 75,
        pickup_lat: 48.8, pickup_lng: 2.3, dropoff_lat: 49, dropoff_lng: 2.5,
        terms_accepted: true, terms_version: 'obsolete',
      },
    });
    await act(async () => root.render(<BookingSection />));
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(container.textContent).toContain('version actuelle');
    expect(container.querySelector('[data-testid="booking-terms-acceptance"]').checked).toBe(false);
  });

  it('carries explicit guest acceptance into the authentication checkout draft', async () => {
    useAuth.mockReturnValue({ user: null });
    const get = axios.get.getMockImplementation();
    axios.get.mockImplementation((url, options) => url.endsWith('/api/booking-terms')
      ? Promise.resolve({ data: { enabled: true, version: '2026-11-04', title: 'CGV', sections: [] } })
      : get(url, options));
    const pickup = { label: 'Paris', position: [48.85, 2.35] };
    const dropoff = { label: 'CDG', position: [49.01, 2.55] };
    mockReadBookingCheckoutDraft.mockReturnValue({
      step: 'auth', date: '2026-11-10T10:00:00.000Z', time: '10:30', transferType: 'simple',
      pickup: pickup.label, dropoff: dropoff.label, selectedCategory: 'Berline',
      mapAddresses: { pickup, dropoff },
    });
    fetchDrivingRoute.mockResolvedValue({ distanceKm: 28.5, durationMinutes: 36, positions: [pickup.position, dropoff.position] });
    axios.post.mockResolvedValue({ data: [{ category_name: 'Berline', final_price: 75 }] });
    await act(async () => root.render(<BookingSection />));
    const login = container.querySelector('[data-testid="auth-login-btn"]');
    expect(login.disabled).toBe(true);
    await act(async () => login.click());
    expect(mockNavigate).not.toHaveBeenCalled();
    await act(async () => container.querySelector('[data-testid="booking-terms-acceptance"]').click());
    expect(login.disabled).toBe(false);
    await act(async () => login.click());
    expect(mockNavigate).toHaveBeenCalledWith('/fr/login', expect.any(Object));
    expect(saveBookingCheckoutDraft).toHaveBeenCalledWith(expect.objectContaining({
      autoPayAfterAuth: true,
      checkoutPayload: expect.objectContaining({ terms_accepted: true, terms_version: '2026-11-04' }),
    }));
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
