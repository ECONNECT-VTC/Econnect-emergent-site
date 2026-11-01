import axios from 'axios';
import { fetchDrivingRoute, reverseAddress, searchAddresses } from './bookingMap';

jest.mock('axios');
const pickup = { label: 'Paris', position: [48.85, 2.35] };
const dropoff = { label: 'CDG', position: [49.01, 2.55] };

beforeEach(() => jest.clearAllMocks());

it('converts geocoder longitude/latitude to Leaflet coordinates and includes address details', async () => {
  axios.get.mockResolvedValue({ data: { features: [{
    properties: { name: 'Gare du Nord', housenumber: '18', street: 'Rue de Dunkerque', city: 'Paris', postcode: '75010' },
    geometry: { coordinates: [2.355, 48.88] },
  }, { properties: {}, geometry: { coordinates: [999, 999] } }] } });
  const result = await searchAddresses('Gare du Nord');
  expect(result).toEqual([{ label: 'Gare du Nord, 18 Rue de Dunkerque, 75010, Paris', position: [48.88, 2.355] }]);
  expect(axios.get.mock.calls[0][1].params.q).toBe('Gare du Nord');
});

it('rejects empty reverse geocoding instead of returning coordinates as a booking address', async () => {
  axios.get.mockResolvedValue({ data: { features: [] } });
  await expect(reverseAddress([48.85, 2.35])).rejects.toThrow('Aucune adresse');
});

it('converts driving metres/seconds and route geometry for map and pricing', async () => {
  axios.get.mockResolvedValue({ data: { code: 'Ok', routes: [{
    distance: 28542, duration: 2101, geometry: { coordinates: [[2.35, 48.85], [2.55, 49.01]] },
  }] } });
  expect(await fetchDrivingRoute(pickup, dropoff)).toEqual({
    positions: [[48.85, 2.35], [49.01, 2.55]], distanceKm: 28.5, durationMinutes: 36,
  });
  expect(axios.get.mock.calls[0][0]).toContain('/driving/2.35,48.85;2.55,49.01');
});

it.each([
  { code: 'NoRoute', routes: [] },
  { code: 'Ok', routes: [{ distance: -1, duration: 20, geometry: { coordinates: [[2, 48], [3, 49]] } }] },
  { code: 'Ok', routes: [{ distance: 20, duration: Infinity, geometry: { coordinates: [[2, 48], [3, 49]] } }] },
  { code: 'Ok', routes: [{ distance: 20, duration: 10, geometry: { coordinates: [[200, 48], [3, 49]] } }] },
])('rejects unavailable or invalid routes without a fabricated distance', async (data) => {
  axios.get.mockResolvedValue({ data });
  await expect(fetchDrivingRoute(pickup, dropoff)).rejects.toThrow('Aucun itinéraire');
});
