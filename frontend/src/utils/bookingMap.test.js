import axios from 'axios';
import { addressesFromBooking, bookingCoordinates, fetchDrivingRoute, mapErrorMessage, reverseAddress, searchAddresses, traceBookingMap } from './bookingMap';

jest.mock('axios');
const pickup = { label: 'Paris', position: [48.85, 2.35] };
const dropoff = { label: 'CDG', position: [49.01, 2.55] };

beforeEach(() => jest.clearAllMocks());

it('uses the configured production API origin for the search POST', async () => {
  const previous = window.__ECONNECT_CONFIG__;
  try {
    window.__ECONNECT_CONFIG__ = { API_URL: 'https://api.econnect-vtc.com' };
    axios.post.mockResolvedValue({ data: { features: [] } });
    await searchAddresses('roissy');
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.econnect-vtc.com/api/map/search',
      { q: 'roissy' }, expect.objectContaining({ withCredentials: true })
    );
  } finally {
    window.__ECONNECT_CONFIG__ = previous;
  }
});

it.each(['production', 'test', 'development'])('only emits diagnostic traces in development, not %s otherwise', (mode) => {
  const previous = process.env.NODE_ENV;
  const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
  try {
    process.env.NODE_ENV = mode;
    traceBookingMap('test stage', { length: 6 });
    expect(debug).toHaveBeenCalledTimes(mode === 'development' ? 1 : 0);
  } finally {
    process.env.NODE_ENV = previous;
    debug.mockRestore();
  }
});

it('distinguishes a missing API route from an address with no results and preserves quota errors', () => {
  expect(mapErrorMessage({ response: { status: 404, data: { detail: 'Not Found' } } }, 'fallback'))
    .toContain('API cartographique est introuvable');
  expect(mapErrorMessage({ response: { status: 429, data: { detail: 'Trop de requêtes.' } } }, 'fallback'))
    .toBe('Trop de requêtes.');
  expect(mapErrorMessage(new Error('Network'), 'fallback')).toBe('fallback');
});

it('converts geocoder longitude/latitude to Leaflet coordinates and includes address details', async () => {
  axios.post.mockResolvedValue({ data: { features: [{
    properties: { name: 'Gare du Nord', housenumber: '18', street: 'Rue de Dunkerque', city: 'Paris', postcode: '75010' },
    geometry: { coordinates: [2.355, 48.88] },
  }, { properties: {}, geometry: { coordinates: [999, 999] } }] } });
  const result = await searchAddresses('Gare du Nord');
  expect(result).toEqual([{ label: 'Gare du Nord, 18 Rue de Dunkerque, 75010, Paris', position: [48.88, 2.355] }]);
  expect(axios.post.mock.calls[0][1].q).toBe('Gare du Nord');
});

it('rejects empty reverse geocoding instead of returning coordinates as a booking address', async () => {
  axios.post.mockResolvedValue({ data: { features: [] } });
  await expect(reverseAddress([48.85, 2.35])).rejects.toThrow('Aucune adresse');
});

it('maps saved booking coordinates without guessing values for historical addresses', () => {
  expect(addressesFromBooking({ pickup_address: 'Paris', dropoff_address: 'CDG' })).toEqual({ pickup: null, dropoff: null });
  const payload = { pickup_address: 'Paris', dropoff_address: 'CDG', ...bookingCoordinates({ pickup, dropoff }) };
  expect(addressesFromBooking(payload)).toEqual({ pickup, dropoff });
  expect(() => bookingCoordinates({ pickup, dropoff: null })).toThrow('géocodez');
});

it('converts driving metres/seconds and route geometry for map and pricing', async () => {
  axios.post.mockResolvedValue({ data: { code: 'Ok', routes: [{
    distance: 28542, duration: 2101, geometry: { coordinates: [[2.35, 48.85], [2.55, 49.01]] },
  }] } });
  expect(await fetchDrivingRoute(pickup, dropoff)).toEqual({
    positions: [[48.85, 2.35], [49.01, 2.55]], distanceKm: 28.5, durationMinutes: 36,
  });
  expect(axios.post.mock.calls[0][0]).toContain('/api/map/route');
  expect(axios.post.mock.calls[0][1]).toEqual({ pickup: { lat: 48.85, lng: 2.35 }, dropoff: { lat: 49.01, lng: 2.55 } });
});

it.each([
  { code: 'NoRoute', routes: [] },
  { code: 'Ok', routes: [{ distance: -1, duration: 20, geometry: { coordinates: [[2, 48], [3, 49]] } }] },
  { code: 'Ok', routes: [{ distance: 20, duration: Infinity, geometry: { coordinates: [[2, 48], [3, 49]] } }] },
  { code: 'Ok', routes: [{ distance: 20, duration: 10, geometry: { coordinates: [[200, 48], [3, 49]] } }] },
])('rejects unavailable or invalid routes without a fabricated distance', async (data) => {
  axios.post.mockResolvedValue({ data });
  await expect(fetchDrivingRoute(pickup, dropoff)).rejects.toThrow('Aucun itinéraire');
});
