import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let lastCalendarProps = null;

jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
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
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}), { virtual: true });
jest.mock('@/components/ui/calendar', () => ({
  Calendar: (props) => {
    lastCalendarProps = props;
    return <div data-testid="calendar-component" />;
  },
}), { virtual: true });
jest.mock('@/components/VehicleFeatureBadges', () => () => <div />, { virtual: true });
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
    expect(lastCalendarProps?.disabled).toBeUndefined();
  });
});
