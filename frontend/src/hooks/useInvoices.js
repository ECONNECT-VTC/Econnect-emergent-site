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
  const [summary, setSummary] = useState({ totalClient: 0, totalCommission: 0, totalDriver: 0, count: 0 });

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, financial] = await Promise.all([
        axios.get(`${API_URL}/api/admin/financial/completed-bookings`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/financial/stats`, { withCredentials: true }),
      ]);
      const totals = financial.data;
      if (!['total_revenue_ttc', 'total_commission_ttc', 'total_driver_earnings', 'completed_bookings_count']
        .every((key) => Number.isFinite(totals?.[key]))) throw new Error('Synthèse financière invalide.');
      setBookings(res.data || []);
      setSummary({ totalClient: totals.total_revenue_ttc, totalCommission: totals.total_commission_ttc,
        totalDriver: totals.total_driver_earnings, count: totals.completed_bookings_count });
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

  return { bookings, loading, error, stats: summary, refetch: fetchInvoices };
};

/**
 * useDriverInvoices – custom hook for driver invoice section.
 */
export const useDriverInvoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supplementaryEarned, setSupplementaryEarned] = useState(0);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, additional] = await Promise.all([
        axios.get(`${API_URL}/api/driver/invoices`, { withCredentials: true }),
        axios.get(`${API_URL}/api/driver/supplementary-invoices`, { withCredentials: true }),
      ]);
      setInvoices(res.data || []);
      if (!Number.isInteger(additional.data?.totals?.driver_cents)) throw new Error('Total complémentaire invalide.');
      setSupplementaryEarned(additional.data.totals.driver_cents / 100);
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
    () => invoices.reduce((s, inv) => s + (inv.driver_earning || 0), 0) + supplementaryEarned,
    [invoices, supplementaryEarned]
  );

  return { invoices, loading, error, totalEarned, refetch: fetchInvoices };
};
