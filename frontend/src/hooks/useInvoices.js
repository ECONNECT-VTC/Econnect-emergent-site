import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';

/**
 * useInvoices – custom hook for admin invoice management.
 *
 * Returns all completed bookings with full financial breakdown
 * so the UI can derive client / driver / commission invoice views.
 */
export const useInvoices = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(
        `${API_URL}/api/admin/financial/completed-bookings`,
        { withCredentials: true }
      );
      setBookings(res.data || []);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erreur lors du chargement des factures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const stats = useMemo(() => {
    const totalClient = bookings.reduce((s, b) => s + (b.price_ttc || 0), 0);
    const totalCommission = bookings.reduce((s, b) => s + (b.commission_ttc || 0), 0);
    const totalDriver = bookings.reduce((s, b) => s + (b.driver_earning || 0), 0);
    return { totalClient, totalCommission, totalDriver, count: bookings.length };
  }, [bookings]);

  return { bookings, loading, error, stats, refetch: fetchInvoices };
};

/**
 * useDriverInvoices – custom hook for driver invoice section.
 */
export const useDriverInvoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/api/driver/invoices`, { withCredentials: true });
      setInvoices(res.data || []);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erreur lors du chargement des factures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const totalEarned = useMemo(
    () => invoices.reduce((s, inv) => s + (inv.driver_earning || 0), 0),
    [invoices]
  );

  return { invoices, loading, error, totalEarned, refetch: fetchInvoices };
};
