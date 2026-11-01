import { act, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import useBookingRoute from './useBookingRoute';
import { fetchDrivingRoute, reverseAddress } from '@/utils/bookingMap';

jest.mock('@/utils/bookingMap', () => ({
  ...jest.requireActual('../utils/bookingMap'),
  fetchDrivingRoute: jest.fn(),
  reverseAddress: jest.fn(),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const pickup = { label: 'Paris', position: [48.85, 2.35] };
const dropoff = { label: 'CDG', position: [49.01, 2.55] };
const route = { distanceKm: 28.5, durationMinutes: 35, positions: [pickup.position, dropoff.position] };
let current;
let metrics;

function Harness() {
  const [pickupText, setPickup] = useState('');
  const [dropoffText, setDropoff] = useState('');
  const onRouteChange = useCallback((value) => { metrics = value; }, []);
  current = useBookingRoute({ pickup: pickupText, dropoff: dropoffText, setPickup, setDropoff, onRouteChange });
  return <p>{pickupText} → {dropoffText}</p>;
}

describe('booking route synchronization', () => {
  let container;
  let root;
  beforeEach(async () => {
    jest.clearAllMocks();
    metrics = null;
    fetchDrivingRoute.mockResolvedValue(route);
    container = document.createElement('div');
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it('fills both form addresses from map selections and calculates price metrics', async () => {
    reverseAddress.mockResolvedValueOnce(pickup).mockResolvedValueOnce(dropoff);
    await act(async () => current.selectMapPosition(pickup.position));
    expect(current.activeField).toBe('dropoff');
    await act(async () => current.selectMapPosition(dropoff.position));
    expect(container.textContent).toBe('Paris → CDG');
    expect(current.route).toEqual(route);
    expect(metrics).toEqual(route);
    expect(fetchDrivingRoute).toHaveBeenCalledWith(pickup, dropoff, expect.any(AbortSignal));
  });

  it('invalidates the old route and prices immediately when an address is edited', async () => {
    await act(async () => { current.selectAddress('pickup', pickup); current.selectAddress('dropoff', dropoff); });
    await act(async () => current.changeAddress('pickup', 'Lyon'));
    expect(current.addresses.pickup).toBeNull();
    expect(current.route).toBeNull();
    expect(metrics).toBeNull();
  });

  it('ignores a stale routing response after the address changes', async () => {
    let resolveRoute;
    fetchDrivingRoute.mockReturnValue(new Promise((resolve) => { resolveRoute = resolve; }));
    await act(async () => { current.selectAddress('pickup', pickup); current.selectAddress('dropoff', dropoff); });
    expect(current.loading).toBe(true);
    await act(async () => current.changeAddress('dropoff', 'Orly'));
    await act(async () => resolveRoute(route));
    expect(current.route).toBeNull();
    expect(metrics).toBeNull();
    expect(current.loading).toBe(false);
  });

  it('ignores an old map selection after typing into the form', async () => {
    let resolveAddress;
    reverseAddress.mockReturnValue(new Promise((resolve) => { resolveAddress = resolve; }));
    let pending;
    await act(async () => { pending = current.selectMapPosition(pickup.position); });
    await act(async () => current.changeAddress('pickup', 'Lyon'));
    await act(async () => { resolveAddress(pickup); await pending; });
    expect(container.textContent).toBe('Lyon → ');
    expect(current.addresses.pickup).toBeNull();
  });

  it('reports routing errors and leaves no success-shaped metrics', async () => {
    fetchDrivingRoute.mockRejectedValue(new Error('Service indisponible'));
    await act(async () => { current.selectAddress('pickup', pickup); current.selectAddress('dropoff', dropoff); });
    expect(current.error).toBe('Service indisponible');
    expect(current.route).toBeNull();
    expect(metrics).toBeNull();
  });

  it('restores saved endpoints and clears them when starting a new booking', async () => {
    await act(async () => {
      current.changeAddress('pickup', pickup.label);
      current.changeAddress('dropoff', dropoff.label);
      current.restoreAddresses({ pickup, dropoff });
    });
    expect(current.route).toEqual(route);
    await act(async () => current.reset());
    expect(current.addresses).toEqual({ pickup: null, dropoff: null });
    expect(current.route).toBeNull();
    expect(metrics).toBeNull();
  });
});
