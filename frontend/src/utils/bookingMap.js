import axios from 'axios';

const geocoderUrl = (process.env.REACT_APP_GEOCODER_URL || 'https://photon.komoot.io').replace(/\/+$/, '');
const routerUrl = (process.env.REACT_APP_ROUTING_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');

export const isCoordinate = (position) => Array.isArray(position)
  && position.length === 2
  && position.every(Number.isFinite)
  && Math.abs(position[0]) <= 90
  && Math.abs(position[1]) <= 180;

export const isAddress = (address) => typeof address?.label === 'string'
  && address.label.trim().length > 0 && isCoordinate(address.position);

const readAddresses = (data) => {
  if (!Array.isArray(data?.features)) throw new Error('Réponse du service d’adresses invalide.');
  return data.features.map((feature) => {
    const properties = feature.properties || {};
    const coordinates = feature.geometry?.coordinates;
    const street = [properties.housenumber, properties.street].filter(Boolean).join(' ');
    const label = [...new Set([
      properties.name, street, properties.postcode, properties.city || properties.town || properties.village,
      properties.country,
    ].filter(Boolean))].join(', ');
    return { label, position: coordinates ? [coordinates[1], coordinates[0]] : null };
  }).filter(isAddress);
};

export const searchAddresses = async (query, signal) => {
  const response = await axios.get(`${geocoderUrl}/api/`, {
    params: { q: query, lang: 'fr', limit: 5, lat: 48.8566, lon: 2.3522 },
    signal,
    timeout: 10000,
  });
  return readAddresses(response.data);
};

export const reverseAddress = async (position, signal) => {
  if (!isCoordinate(position)) throw new Error('Position invalide.');
  const response = await axios.get(`${geocoderUrl}/reverse`, {
    params: { lat: position[0], lon: position[1], lang: 'fr', limit: 1 },
    signal,
    timeout: 10000,
  });
  const address = readAddresses(response.data)[0];
  if (!address) throw new Error('Aucune adresse trouvée à cet endroit. Choisissez un autre point.');
  return address;
};

export const fetchDrivingRoute = async (pickup, dropoff, signal) => {
  if (!isAddress(pickup) || !isAddress(dropoff)) throw new Error('Adresses invalides.');
  const coordinates = [pickup, dropoff].map(({ position }) => `${position[1]},${position[0]}`).join(';');
  const response = await axios.get(`${routerUrl}/route/v1/driving/${coordinates}`, {
    params: { overview: 'full', geometries: 'geojson', steps: false },
    signal,
    timeout: 15000,
  });
  const route = response.data?.routes?.[0];
  const positions = route?.geometry?.coordinates?.map((point) => [point[1], point[0]]);
  if (response.data?.code !== 'Ok' || !(route?.distance > 0) || !Number.isFinite(route.distance)
    || !(route.duration > 0) || !Number.isFinite(route.duration)
    || !positions || positions.length < 2 || !positions.every(isCoordinate)) {
    throw new Error('Aucun itinéraire routier disponible entre ces adresses.');
  }
  return {
    positions,
    distanceKm: Math.max(0.1, Math.round(route.distance / 100) / 10),
    durationMinutes: Math.max(1, Math.ceil(route.duration / 60)),
  };
};
