import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { fetchDrivingRoute, isAddress, reverseAddress } from '@/utils/bookingMap';

const emptyAddresses = { pickup: null, dropoff: null };

export default function useBookingRoute({ pickup, dropoff, setPickup, setDropoff, onRouteChange }) {
  const [addresses, setAddresses] = useState(emptyAddresses);
  const [activeField, setActiveField] = useState('pickup');
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reverseController = useRef(null);
  const routeController = useRef(null);

  const invalidateRoute = useCallback(() => {
    routeController.current?.abort();
    setRoute(null);
    setError('');
    setLoading(false);
    onRouteChange(null);
  }, [onRouteChange]);

  const changeAddress = useCallback((field, value) => {
    reverseController.current?.abort();
    invalidateRoute();
    (field === 'pickup' ? setPickup : setDropoff)(value);
    setAddresses((current) => ({ ...current, [field]: null }));
    setActiveField(field);
  }, [invalidateRoute, setPickup, setDropoff]);

  const selectAddress = useCallback((field, address) => {
    if (!isAddress(address)) return;
    reverseController.current?.abort();
    invalidateRoute();
    (field === 'pickup' ? setPickup : setDropoff)(address.label);
    setAddresses((current) => ({ ...current, [field]: address }));
    setActiveField(field === 'pickup' ? 'dropoff' : 'pickup');
  }, [invalidateRoute, setPickup, setDropoff]);

  const selectMapPosition = useCallback(async (position) => {
    reverseController.current?.abort();
    invalidateRoute();
    const controller = new AbortController();
    reverseController.current = controller;
    setLoading(true);
    try {
      const address = await reverseAddress(position, controller.signal);
      if (!controller.signal.aborted) selectAddress(activeField, address);
    } catch (err) {
      if (!controller.signal.aborted && !axios.isCancel(err)) {
        setError(err.message || 'Impossible de localiser cette adresse.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [activeField, invalidateRoute, selectAddress]);

  useEffect(() => {
    if (!addresses.pickup || !addresses.dropoff
      || addresses.pickup.label !== pickup || addresses.dropoff.label !== dropoff) return;
    const controller = new AbortController();
    routeController.current = controller;
    setLoading(true);
    setError('');
    onRouteChange(null);
    fetchDrivingRoute(addresses.pickup, addresses.dropoff, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRoute(result);
        onRouteChange(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted && !axios.isCancel(err)) {
          setError(err.message || 'Impossible de calculer l’itinéraire.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [addresses, pickup, dropoff, onRouteChange]);

  useEffect(() => () => {
    reverseController.current?.abort();
    routeController.current?.abort();
  }, []);

  const reset = useCallback(() => {
    reverseController.current?.abort();
    invalidateRoute();
    setAddresses(emptyAddresses);
    setActiveField('pickup');
  }, [invalidateRoute]);

  const restoreAddresses = useCallback((saved) => {
    setAddresses({
      pickup: isAddress(saved?.pickup) ? saved.pickup : null,
      dropoff: isAddress(saved?.dropoff) ? saved.dropoff : null,
    });
  }, []);

  return {
    addresses, activeField, setActiveField, route, loading, error,
    changeAddress, selectAddress, selectMapPosition, reset, restoreAddresses,
  };
}
