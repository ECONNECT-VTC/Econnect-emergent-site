import { useCallback } from 'react';
import useBookingRoute from './useBookingRoute';
import { addressesFromBooking, bookingCoordinates } from '@/utils/bookingMap';

export default function useBookingFormMap(form, setForm) {
  const setPickup = useCallback((value) => setForm((current) => ({ ...current, pickup_address: value })), [setForm]);
  const setDropoff = useCallback((value) => setForm((current) => ({ ...current, dropoff_address: value })), [setForm]);
  const onRouteChange = useCallback((route) => setForm((current) => ({
    ...current,
    distance_km: route ? String(route.distanceKm) : '',
    duration_minutes: route ? String(route.durationMinutes) : '',
  })), [setForm]);
  const map = useBookingRoute({
    pickup: form.pickup_address || '', dropoff: form.dropoff_address || '',
    setPickup, setDropoff, onRouteChange,
  });
  return {
    ...map,
    restoreBooking: (booking) => { map.reset(); map.restoreAddresses(addressesFromBooking(booking)); },
    coordinatePayload: () => bookingCoordinates(map.addresses),
    valid: map.geocoded && !map.loading,
  };
}
