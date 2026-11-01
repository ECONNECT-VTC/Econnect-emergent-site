import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { fetchDrivingRoute, reverseAddress } from '@/utils/bookingMap';
import { createCheckoutSession, saveBookingCheckoutDraft } from '@/utils/bookingCheckout';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let lastCalendarProps = null;
let mockMapProps;

jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('date-fns', () => ({ format: () => '10/11/2026' }));
jest.mock('date-fns/locale', () => ({ fr: {} }), { virtual: true });
jest.mock('react-router-dom', () => ({
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
jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props) => <textarea {...props} />,
}), { virtual: true });
jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }) => <div>{children}</div>,
  PopoverTrigger: ({ children }) => <div>{children}</div>,
  PopoverContent: ({ children }) => <div>{children}</div>,
}), { virtual: true });
jest.mock('@/components/ui/select', () => {
  const React = require('react');
  const SelectContext = React.createContext(null);
  return {
    Select: ({ children, onValueChange }) => <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>,
    SelectTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem: ({ children, value }) => {
      const onValueChange = React.useContext(SelectContext);
      return <button type="button" data-value={value} onClick={() => onValueChange?.(value)}>{children}</button>;
    },
    SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  };
}, { virtual: true });
jest.mock('@/components/ui/calendar', () => ({
  Calendar: (props) => {
    lastCalendarProps = props;
    return <div data-testid="calendar-component" />;
  },
}), { virtual: true });
jest.mock('@/components/VehicleFeatureBadges', () => () => <div />, { virtual: true });
jest.mock('@/components/InteractiveMap', () => (props) => { mockMapProps = props; return <div />; }, { virtual: true });
jest.mock('@/utils/bookingMap', () => ({
  ...jest.requireActual('../../utils/bookingMap'),
  fetchDrivingRoute: jest.fn(),
  reverseAddress: jest.fn(),
}));
jest.mock('@/utils/vehicleCategories', () => {
  const actual = jest.requireActual('../../utils/vehicleCategories');
  return actual;
}, { virtual: true });
jest.mock('@/utils/bookingCheckout', () => ({
  createCheckoutSession: jest.fn(),
  saveBookingCheckoutDraft: jest.fn(),
}), { virtual: true });
jest.mock('@phosphor-icons/react', () => ({
  ArrowRight: () => null,
  Calendar: () => null,
  Car: () => null,
  CircleNotch: () => null,
  Clock: () => null,
  CurrencyEur: () => null,
  MapPin: () => null,
}), { virtual: true });

const NewBooking = require('./NewBooking').default;

describe('NewBooking form rendering', () => {
  let container;
  let root;

  beforeEach(() => {
    lastCalendarProps = null;
    fetchDrivingRoute.mockReset();
    reverseAddress.mockReset();
    createCheckoutSession.mockReset();
    saveBookingCheckoutDraft.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockReset();
    axios.post.mockReset();
    axios.get.mockResolvedValue({
      data: [
        { id: 'berline-id', name: 'Berline', min_fare: 30, max_passengers: 4, max_luggage: 4, has_wifi: true },
        { id: 'luxe-id', name: 'Luxe', min_fare: 90, max_passengers: 4, max_luggage: 4, has_wifi: true },
      ],
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  it('renders vehicle categories with commercial labels and no past-date restriction', async () => {
    await act(async () => {
      root.render(<NewBooking />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Confort Classique');
    expect(container.textContent).toContain('Prestige');
    expect(container.querySelector('[data-testid="passenger-count-select"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="baby-seat-count-select"]')).not.toBeNull();
    expect(lastCalendarProps?.disabled).toBeUndefined();
  });

  it('uses map-selected addresses, distance and duration for client estimates and checkout', async () => {
    jest.useFakeTimers();
    const pickup = { label: 'Paris', position: [48.85, 2.35] };
    const dropoff = { label: 'CDG', position: [49.01, 2.55] };
    reverseAddress.mockResolvedValueOnce(pickup).mockResolvedValueOnce(dropoff);
    fetchDrivingRoute.mockResolvedValue({ distanceKm: 28.5, durationMinutes: 36, positions: [pickup.position, dropoff.position] });
    axios.post.mockResolvedValue({ data: [{ category_id: 'berline-id', final_price: 75, price_per_km: 2.5 }] });
    createCheckoutSession.mockRejectedValue(new Error('Payment not started in test'));
    await act(async () => root.render(<NewBooking />));
    await act(async () => {
      lastCalendarProps.onSelect(new Date('2026-11-10'));
      container.querySelector('[data-value="10:30"]').click();
      container.querySelector('[data-value="simple"]').click();
    });
    await act(async () => mockMapProps.onSelectPosition(pickup.position));
    await act(async () => mockMapProps.onSelectPosition(dropoff.position));
    await act(async () => { jest.advanceTimersByTime(500); await Promise.resolve(); });
    expect(container.querySelector('[data-testid="pickup-input"]').value).toBe('Paris');
    expect(container.querySelector('[data-testid="dropoff-input"]').value).toBe('CDG');
    expect(container.querySelector('[data-testid="distance-input"]').value).toBe('28.5');
    expect(container.querySelector('[data-testid="duration-input"]').value).toBe('36');
    const query = new URL(axios.post.mock.calls.at(-1)[0]).searchParams;
    expect(query.get('distance_km')).toBe('28.5');
    expect(query.get('duration_minutes')).toBe('36');
    await act(async () => container.querySelector('[data-testid="vehicle-berline-id"]').click());
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      pickup_address: 'Paris', dropoff_address: 'CDG', distance_km: 28.5, duration_minutes: 36, estimated_price: 75,
    }));
    expect(saveBookingCheckoutDraft).toHaveBeenCalledWith(expect.objectContaining({
      mapAddresses: { pickup, dropoff }, durationMinutes: '36',
    }));
    jest.useRealTimers();
  });
});
