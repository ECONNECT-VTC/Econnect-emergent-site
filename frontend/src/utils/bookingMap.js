import axios from 'axios';
import API_URL from '@/config';

export const traceBookingMap = (stage, details) => {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[BookingMap] ${stage}`, details);
  }
};

export const isCoordinate = (position) => Array.isArray(position)
  && position.length === 2
  && position.every(Number.isFinite)
  && Math.abs(position[0]) <= 90
  && Math.abs(position[1]) <= 180;

export const isAddress = (address) => typeof address?.label === 'string'
  && address.label.trim().length > 0 && isCoordinate(address.position);

export const bookingCoordinates = (addresses) => {
  if (!isAddress(addresses?.pickup) || !isAddress(addresses?.dropoff)) {
    throw new Error('Choisissez et géocodez les adresses de départ et d’arrivée.');
  }
  return {
    pickup_lat: addresses.pickup.position[0], pickup_lng: addresses.pickup.position[1],
    dropoff_lat: addresses.dropoff.position[0], dropoff_lng: addresses.dropoff.position[1],
  };
};

export const addressesFromBooking = (booking) => {
  const address = (field) => {
    const result = { label: booking?.[`${field}_address`], position: [booking?.[`${field}_lat`], booking?.[`${field}_lng`]] };
    return isAddress(result) ? result : null;
  };
  return { pickup: address('pickup'), dropoff: address('dropoff') };
};

export const mapErrorMessage = (error, fallback) => {
  if (error?.response?.status === 404) {
    return 'Service de recherche et de trajet indisponible : l’API cartographique est introuvable. Veuillez réessayer plus tard.';
  }
  return typeof error?.response?.data?.detail === 'string'
    ? error.response.data.detail : fallback;
};

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
  const url = `${API_URL}/api/map/search`;
  traceBookingMap('searchAddresses: POST', { url, queryLength: query.length, aborted: signal?.aborted });
  const response = await axios.post(url, { q: query }, {
    signal,
    timeout: 15000,
    withCredentials: true,
  });
  traceBookingMap('searchAddresses: response', { status: response.status, count: response.data?.features?.length });
  return readAddresses(response.data);
};

export const reverseAddress = async (position, signal) => {
  if (!isCoordinate(position)) throw new Error('Position invalide.');
  const response = await axios.post(`${API_URL}/api/map/reverse`, { lat: position[0], lng: position[1] }, {
    signal,
    timeout: 15000,
    withCredentials: true,
  });
  const address = readAddresses(response.data)[0];
  if (!address) throw new Error('Aucune adresse trouvée à cet endroit. Choisissez un autre point.');
  return address;
};

export const fetchDrivingRoute = async (pickup, dropoff, signal) => {
  if (!isAddress(pickup) || !isAddress(dropoff)) throw new Error('Adresses invalides.');
  const response = await axios.post(`${API_URL}/api/map/route`, {
    pickup: { lat: pickup.position[0], lng: pickup.position[1] },
    dropoff: { lat: dropoff.position[0], lng: dropoff.position[1] },
  }, {
    signal,
    timeout: 15000,
    withCredentials: true,
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
