import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('axios');

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    useParams: () => ({ bookingId: 'booking_1', lang: 'fr' }),
  };
}, { virtual: true });

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'client' } }),
}), { virtual: true });

jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('@/utils/vehicleCategories', () => ({
  getCategoryDisplayName: (categoryName) => (categoryName === 'Berline' ? 'Confort Classique' : categoryName),
}), { virtual: true });

const BookingDetail = require('./BookingDetail').default;

describe('BookingDetail vehicle category display', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockResolvedValue({
      data: {
        id: 'booking_1',
        client_name: 'Client Test',
        client_email: 'client@test.com',
        pickup_address: 'Paris',
        dropoff_address: 'CDG',
        pickup_date: '20/06/2026',
        pickup_time: '10:30',
        transfer_type: 'simple',
        vehicle_category_name: 'Berline',
        status: 'pending',
        created_at: '2026-06-08T12:00:00Z',
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    axios.get.mockReset();
  });

  it('renders commercial vehicle category name in trip info', async () => {
    await act(async () => {
      root.render(<BookingDetail />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Confort Classique');
  });

  it('shows explicit fallback when driver is admin-like label', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        id: 'booking_1',
        client_name: 'Client Test',
        client_email: 'client@test.com',
        pickup_address: 'Paris',
        dropoff_address: 'CDG',
        pickup_date: '20/06/2026',
        pickup_time: '10:30',
        transfer_type: 'simple',
        status: 'pending',
        created_at: '2026-06-08T12:00:00Z',
        driver_name: 'Administrateur',
      },
    });

    await act(async () => {
      root.render(<BookingDetail />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Chauffeur non assigné');
    expect(container.textContent).not.toContain('Administrateur');
  });
});
