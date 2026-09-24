import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarCheck, CarSimple, CheckCircle, MapPin, User, DownloadSimple } from '@phosphor-icons/react';
import API_URL from '@/config';
import BookingComments from '@/components/BookingComments';
import { COURSE_STATUS_LABELS, COURSE_STATUS_STYLES, isStatusAtOrAfter, normalizeCourseStatus, statusEquals } from '../../utils/courseWorkflow';
import { getCategoryDisplayName } from '@/utils/vehicleCategories';
import { useAuth } from '@/contexts/AuthContext';
import { downloadInvoicePdf } from '@/utils/invoiceGenerator';
import {
  formatPaymentMethodLabel,
  normalizeEditablePaymentStatus,
  normalizePaymentMethod,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
} from '@/utils/paymentUtils';
import { buildAdminEstimatePriceQuery, toOptionalNumber } from './adminBookingUtils';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

const parseError = (error) => {
  const detail = error?.response?.data?.detail;
  if (!detail) return 'Erreur inconnue';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => `${e.loc?.slice(-1)[0] || 'champ'}: ${e.msg}`).join(' | ');
  }
  return 'Erreur inconnue';
};

const getInitialCreateForm = () => ({
  client_name: '',
  client_email: '',
  client_phone: '',
  pickup_address: '',
  dropoff_address: '',
  pickup_date: '',
  pickup_time: '',
  transfer_type: 'simple',
  vehicle_category_id: '',
  notes: '',
  estimated_price: '',
  distance_km: '',
  duration_minutes: '',
  disposition_hours: '',
  payment_mode: 'deferred',
  payment_method: '',
  payment_status: 'pending',
});

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, '0');
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

const AdminBookings = () => {
  const { lang = 'fr' } = useParams();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [clients, setClients] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicleCategories, setVehicleCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(searchParams.get('status') || 'all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState(getInitialCreateForm);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [creating, setCreating] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [cancellationDialogOpen, setCancellationDialogOpen] = useState(false);
  const [cancellationAction, setCancellationAction] = useState('approve');
  const [refundAmount, setRefundAmount] = useState('');
  const [error, setError] = useState('');
  const [adminCancelDialogOpen, setAdminCancelDialogOpen] = useState(false);
  const [adminCancelReason, setAdminCancelReason] = useState('');
  const [adminCancelRefundAmount, setAdminCancelRefundAmount] = useState('');
  const [bookingToAdminCancel, setBookingToAdminCancel] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [adminFleet, setAdminFleet] = useState([]);
  const [assignSelfDialogOpen, setAssignSelfDialogOpen] = useState(false);
  const [bookingToAssignSelf, setBookingToAssignSelf] = useState(null);
  const [selectedFleetVehicle, setSelectedFleetVehicle] = useState('');
  const [assignSelfDriverName, setAssignSelfDriverName] = useState('');
  const [assigningSelf, setAssigningSelf] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState('');
  const [documentActionId, setDocumentActionId] = useState('');
  const [googleMapsReady, setGoogleMapsReady] = useState(Boolean(window.google?.maps?.places));
  const pickupRef = useRef(null);
  const dropoffRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;

    const existingScript = document.getElementById('google-maps-script');
    const handleLoad = () => setGoogleMapsReady(Boolean(window.google?.maps?.places));

    if (window.google?.maps?.places) {
      setGoogleMapsReady(true);
      return undefined;
    }

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad);
      return () => existingScript.removeEventListener('load', handleLoad);
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.addEventListener('load', handleLoad);
    document.head.appendChild(script);

    return () => script.removeEventListener('load', handleLoad);
  }, []);

  useEffect(() => {
    if (!createDialogOpen || !window.google?.maps?.places) return;

    const calculateDistance = (origin, destination) => {
      if (!origin || !destination || !window.google?.maps?.DistanceMatrixService) return;
      const service = new window.google.maps.DistanceMatrixService();
      service.getDistanceMatrix(
        { origins: [origin], destinations: [destination], travelMode: window.google.maps.TravelMode.DRIVING },
        (response, status) => {
          if (status === 'OK') {
            const element = response.rows?.[0]?.elements?.[0];
            if (element?.status === 'OK' && element.distance) {
              const km = Math.round((element.distance.value / 1000) * 10) / 10;
              const mins = element.duration?.value ? Math.round(element.duration.value / 60) : null;
              setCreateForm((prev) => ({ ...prev, distance_km: String(km), duration_minutes: mins != null ? String(mins) : prev.duration_minutes }));
            }
          }
        }
      );
    };

    const setupAutocomplete = (inputRef, field) => {
      if (!inputRef.current) return null;

      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, { types: ['address'] });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const address = place.formatted_address || '';
        setCreateForm((prev) => {
          const next = { ...prev, [field]: address };
          const pickup = field === 'pickup_address' ? address : prev.pickup_address;
          const dropoff = field === 'dropoff_address' ? address : prev.dropoff_address;
          if (pickup && dropoff) {
            setTimeout(() => calculateDistance(pickup, dropoff), 0);
          }
          return next;
        });
      });

      return autocomplete;
    };

    const pickupAutocomplete = setupAutocomplete(pickupRef, 'pickup_address');
    const dropoffAutocomplete = setupAutocomplete(dropoffRef, 'dropoff_address');

    return () => {
      if (pickupAutocomplete) window.google.maps.event.clearInstanceListeners(pickupAutocomplete);
      if (dropoffAutocomplete) window.google.maps.event.clearInstanceListeners(dropoffAutocomplete);
    };
  }, [createDialogOpen, googleMapsReady]);

  const fetchData = useCallback(async (includeUnpaidPending = false) => {
    setLoading(true);
    try {
      const bookingParams = includeUnpaidPending ? { include_unpaid_pending: true } : undefined;
      const [bookingsRes, driversRes, clientsRes, categoriesRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/bookings`, { withCredentials: true, params: bookingParams }),
        axios.get(`${API_URL}/api/admin/drivers`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/clients`, { withCredentials: true }),
        axios.get(`${API_URL}/api/vehicle-categories`, { withCredentials: true })
      ]);
      setBookings(bookingsRes.data);
      setDrivers(driversRes.data);
      setClients(clientsRes.data);
      setVehicleCategories(categoriesRes.data);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(filter === 'awaiting_payment'); }, [fetchData, filter]);

  useEffect(() => {
    if (!createDialogOpen) return;
    const queryString = buildAdminEstimatePriceQuery({
      transferType: createForm.transfer_type,
      distanceKm: createForm.distance_km,
      durationMinutes: createForm.duration_minutes,
      dispositionHours: createForm.disposition_hours,
    });
    if (!queryString) return;

    const debounceTimer = setTimeout(async () => {
      try {
        const response = await axios.post(
          `${API_URL}/api/estimate-price?${queryString}`,
          {},
          { withCredentials: true },
        );
        const estimates = Array.isArray(response.data) ? response.data : [];
        if (estimates.length === 0) return;

        const selectedEstimate = createForm.vehicle_category_id
          ? estimates.find((estimate) => estimate.category_id === createForm.vehicle_category_id)
          : estimates[0];
        const estimatedPrice = toOptionalNumber(selectedEstimate?.final_price);
        if (estimatedPrice === null) return;

        setCreateForm((prev) => ({ ...prev, estimated_price: String(estimatedPrice) }));
      } catch {
        // keep manual value if estimate endpoint is unavailable
      }
    }, 450);

    return () => clearTimeout(debounceTimer);
  }, [
    createDialogOpen,
    createForm.transfer_type,
    createForm.distance_km,
    createForm.duration_minutes,
    createForm.disposition_hours,
    createForm.vehicle_category_id,
  ]);

  const updateCreateField = (field, value) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectedClientChange = (value) => {
    if (value === 'manual') {
      setSelectedClientId('');
      setCreateForm((prev) => ({
        ...prev,
        client_name: '',
        client_email: '',
        client_phone: ''
      }));
      return;
    }

    const client = clients.find((entry) => entry.id === value);
    setSelectedClientId(value);
    if (!client) return;

    setCreateForm((prev) => ({
      ...prev,
      client_name: client.name || '',
      client_email: client.email || '',
      client_phone: client.phone || ''
    }));
  };

  const handleCreateDialogOpenChange = (open) => {
    setCreateDialogOpen(open);
    if (!open) {
      setSelectedClientId('');
      setCreateForm(getInitialCreateForm());
    }
  };

  const handleCreateBooking = async () => {
    setCreating(true);
    setError('');
    try {
      await axios.post(
        `${API_URL}/api/admin/bookings`,
        {
          ...createForm,
          vehicle_category_id: createForm.vehicle_category_id || null,
          estimated_price: toOptionalNumber(createForm.estimated_price),
          distance_km: toOptionalNumber(createForm.distance_km),
          duration_minutes: toOptionalNumber(createForm.duration_minutes),
          disposition_hours: toOptionalNumber(createForm.disposition_hours),
          payment_mode: createForm.payment_mode || 'deferred',
          payment_method: normalizePaymentMethod(createForm.payment_method) || null,
          payment_status: createForm.payment_status || 'pending',
        },
        { withCredentials: true }
      );
      handleCreateDialogOpenChange(false);
      fetchData();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setCreating(false);
    }
  };

  const sendQuote = async (bookingId) => {
    setDocumentActionId(bookingId);
    setError('');
    try {
      await axios.post(`${API_URL}/api/courses/${bookingId}/quote`, {}, { withCredentials: true });
      downloadInvoicePdf(API_URL, bookingId, 'quote');
      fetchData();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setDocumentActionId('');
    }
  };

  const validateQuote = async (bookingId) => {
    setDocumentActionId(bookingId);
    setError('');
    try {
      await axios.patch(
        `${API_URL}/api/courses/${bookingId}/status`,
        { status: 'QUOTE_ACCEPTED' },
        { withCredentials: true }
      );
      fetchData();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setDocumentActionId('');
    }
  };

  const openAssignSelfDialog = async (booking) => {
    setBookingToAssignSelf(booking);
    setSelectedFleetVehicle('');
    setAssignSelfDriverName(user?.name || '');
    try {
      const res = await axios.get(`${API_URL}/api/admin/fleet`, { withCredentials: true });
      setAdminFleet(res.data);
    } catch {
      setAdminFleet([]);
    }
    setAssignSelfDialogOpen(true);
  };

  const assignSelf = async () => {
    if (!bookingToAssignSelf) return;
    setAssigningSelf(true);
    setError('');
    try {
      await axios.post(
        `${API_URL}/api/admin/bookings/${bookingToAssignSelf.id}/assign-self`,
        { vehicle_id: selectedFleetVehicle || null, driver_display_name: assignSelfDriverName },
        { withCredentials: true }
      );
      setAssignSelfDialogOpen(false);
      setBookingToAssignSelf(null);
      setAssignSelfDriverName('');
      fetchData();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setAssigningSelf(false);
    }
  };

  const updateAdminTripStatus = async (bookingId, status) => {
    setStatusUpdatingId(bookingId);
    setError('');
    try {
      await axios.put(
        `${API_URL}/api/admin/bookings/${bookingId}/status`,
        { status },
        { withCredentials: true }
      );
      fetchData();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setStatusUpdatingId('');
    }
  };

  const openAssignDialog = async (booking) => {
    setError('');
    // Refresh the booking data first to avoid assigning a stale-status booking (Bug 2 fix)
    try {
      const [bookingsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/bookings`, { withCredentials: true }),
      ]);
      setBookings(bookingsRes.data);
      const freshBooking = bookingsRes.data.find((b) => b.id === booking.id);
      if (!freshBooking) {
        setError('Course introuvable. La liste a été actualisée.');
        return;
      }
      if (!statusEquals(freshBooking.status, 'QUOTE_ACCEPTED') && !statusEquals(freshBooking.status, 'ORDER_ISSUED')) {
        setError(`Impossible d'assigner : la course est en statut "${freshBooking.status}". Le devis doit être validé avant l'affectation. La liste a été actualisée.`);
        return;
      }
      setSelectedBooking(freshBooking);
    } catch {
      setSelectedBooking(booking);
    }
    setSelectedDriver('');
    setAssignDialogOpen(true);
  };

  const assignDriver = async () => {
    if (!selectedBooking || !selectedDriver) return;
    setAssigning(true);
    setError('');
    try {
      await axios.put(`${API_URL}/api/admin/bookings/${selectedBooking.id}/assign`, { driver_id: selectedDriver }, { withCredentials: true });
      setAssignDialogOpen(false);
      setSelectedBooking(null);
      setSelectedDriver('');
      fetchData();
    } catch (err) {
      // Refresh on failure so the UI reflects the real state (Bug 2 fix)
      fetchData();
      setError('La course a été modifiée entre-temps. La liste a été actualisée.');
    } finally {
      setAssigning(false);
    }
  };

  const openCancellationDialog = (booking, action) => {
    setSelectedBooking(booking);
    setCancellationAction(action);
    setRefundAmount('');
    setCancellationDialogOpen(true);
  };

  const handleCancellationDecision = async () => {
    if (!selectedBooking) return;

    setError('');
    try {
      await axios.put(
        `${API_URL}/api/admin/bookings/${selectedBooking.id}/cancellation`,
        {
          approved: cancellationAction === 'approve',
          refund_amount: cancellationAction === 'approve' && refundAmount !== '' ? Number(refundAmount) : null
        },
        { withCredentials: true }
      );
      setCancellationDialogOpen(false);
      setSelectedBooking(null);
      setRefundAmount('');
      fetchData();
    } catch (err) {
      setError(parseError(err));
    }
  };

  const openAdminCancelDialog = (booking) => {
    setBookingToAdminCancel(booking);
    setAdminCancelReason('');
    setAdminCancelRefundAmount('');
    setAdminCancelDialogOpen(true);
  };

  const openEditDialog = (booking) => {
    setEditingBooking(booking);
    setEditForm({
      pickup_address: booking.pickup_address || '',
      dropoff_address: booking.dropoff_address || '',
      pickup_date: booking.pickup_date || '',
      pickup_time: booking.pickup_time || '',
      notes: booking.notes || '',
      estimated_price: booking.estimated_price != null ? String(booking.estimated_price) : '',
      payment_method: normalizePaymentMethod(booking.payment_method),
      payment_status: normalizeEditablePaymentStatus(booking.payment_status),
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingBooking) return;
    setEditSubmitting(true);
    setError('');
    try {
      const payload = { ...editForm };
      if (payload.estimated_price !== '') payload.estimated_price = Number(payload.estimated_price);
      else delete payload.estimated_price;
      payload.payment_method = normalizePaymentMethod(payload.payment_method) || null;
      payload.payment_status = payload.payment_status || 'pending';
      await axios.put(`${API_URL}/api/admin/bookings/${editingBooking.id}`, payload, { withCredentials: true });
      setEditDialogOpen(false);
      setEditingBooking(null);
      fetchData();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleAdminCancellation = async () => {
    if (!bookingToAdminCancel) return;
    setError('');
    try {
      await axios.put(
        `${API_URL}/api/admin/bookings/${bookingToAdminCancel.id}/cancel`,
        {
          cancellation_reason: adminCancelReason || null,
          refund_amount:
            bookingToAdminCancel.payment_status === 'paid' && adminCancelRefundAmount !== ''
              ? Number(adminCancelRefundAmount)
              : null,
        },
        { withCredentials: true }
      );
      setAdminCancelDialogOpen(false);
      setBookingToAdminCancel(null);
      setAdminCancelReason('');
      setAdminCancelRefundAmount('');
      fetchData();
    } catch (err) {
      setError(parseError(err));
    }
  };

  const filteredBookings = filter === 'all'
    ? bookings
    : filter === 'awaiting_payment'
      ? bookings.filter((b) => b.payment_status === 'pending')
      : bookings.filter((b) => normalizeCourseStatus(b.status) === filter);
  const canCreateBooking =
    createForm.client_name.trim() &&
    createForm.client_email.trim() &&
    createForm.pickup_address.trim() &&
    createForm.dropoff_address.trim() &&
    createForm.pickup_date.trim() &&
    createForm.pickup_time &&
    createForm.transfer_type;

  const getStatusBadge = (status) => {
    const normalized = normalizeCourseStatus(status);
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${COURSE_STATUS_STYLES[normalized] || 'bg-zinc-500/20 text-zinc-300'}`}>{COURSE_STATUS_LABELS[normalized] || normalized}</span>;
  };

  const getPaymentBadge = (paymentStatus) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-300',
      paid: 'bg-green-500/20 text-green-300',
      refunded: 'bg-emerald-500/20 text-emerald-300',
      partially_refunded: 'bg-emerald-500/20 text-emerald-300',
      failed: 'bg-red-500/20 text-red-300',
      not_required: 'bg-zinc-500/20 text-zinc-300',
    };
    const labels = {
      pending: 'Paiement en attente',
      paid: 'Payée',
      refunded: 'Remboursée',
      partially_refunded: 'Partiellement remboursée',
      failed: 'Paiement échoué',
      not_required: 'Sans paiement',
    };
    if (!paymentStatus) return null;
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[paymentStatus] || 'bg-zinc-500/20 text-zinc-300'}`}>{labels[paymentStatus] || paymentStatus}</span>;
  };

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      {error && <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>}

      <div className="flex justify-end mb-4">
        <Button className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]" onClick={() => setCreateDialogOpen(true)}>
          + Nouvelle course
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'awaiting_payment', 'DRAFT', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'ORDER_ISSUED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'cancellation_requested', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA]'}`}>
            {s === 'all' ? 'Toutes' :
              s === 'awaiting_payment' ? 'En attente de paiement' :
              s === 'DRAFT' ? 'Brouillons' :
              s === 'QUOTE_SENT' ? 'Devis envoyés' :
              s === 'QUOTE_ACCEPTED' ? 'Confirmées' :
              s === 'ORDER_ISSUED' ? 'Bon émis' :
              s === 'ASSIGNED' ? 'Assignées' :
              s === 'IN_PROGRESS' ? 'En cours' :
              s === 'COMPLETED' ? 'Terminées' :
              s === 'INVOICED' ? 'Facturées' :
              s === 'PAID' ? 'Payées' :
              s === 'cancellation_requested' ? 'Annulation demandée' : 'Annulées'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
      ) : filteredBookings.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <CalendarCheck size={48} className="text-[#A1A1AA] mx-auto mb-4" />
          <p className="text-[#A1A1AA]">Aucune reservation</p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="admin-bookings">
          {filteredBookings.map((booking) => {
            const paymentPending = booking.payment_status === 'pending';
            const isBankTransferPending = paymentPending && normalizePaymentMethod(booking.payment_method) === 'virement';
            const isPostAssignmentStatus = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED']
              .some((status) => statusEquals(booking.status, status));
            const canSendQuote = statusEquals(booking.status, 'DRAFT') && !paymentPending;
            const canValidateQuote = statusEquals(booking.status, 'QUOTE_SENT') && !paymentPending;
            const canSelfAssign = statusEquals(booking.status, 'QUOTE_ACCEPTED') || statusEquals(booking.status, 'ORDER_ISSUED');
            const canDownloadQuote = isStatusAtOrAfter(booking.status, 'QUOTE_SENT');
            const bookingDriverName = booking.driver_display_name || booking.driver_name;

            return (
            <div key={booking.id} className="glass rounded-xl p-6">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <User size={18} className="text-[#D4AF37]" />
                    <span className="font-medium">{booking.client_name}</span>
                  </div>
                  <p className="text-sm text-[#A1A1AA]">{booking.client_email}</p>
                  <p className="text-sm text-[#D4AF37]">{booking.pickup_date} - {booking.pickup_time}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {getStatusBadge(booking.status)}
                  {getPaymentBadge(booking.payment_status)}
                  {booking.fulfilled_by_admin && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-300">Admin</span>
                  )}

                  {canSendQuote && (
                    <Button
                      size="sm"
                      className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
                      onClick={() => sendQuote(booking.id)}
                      disabled={documentActionId === booking.id}
                    >
                      <CheckCircle size={16} className="mr-1" />Envoyer le devis
                    </Button>
                  )}

                  {canValidateQuote && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-sky-500/50 text-sky-300 hover:bg-sky-500/10"
                      onClick={() => validateQuote(booking.id)}
                      disabled={documentActionId === booking.id}
                    >
                      <CheckCircle size={16} className="mr-1" />Valider le devis
                    </Button>
                  )}

                  {canSelfAssign && (
                    <Button size="sm" variant="outline" className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10" onClick={() => openAssignSelfDialog(booking)}>
                      <CheckCircle size={16} className="mr-1" />S'affecter (admin)
                    </Button>
                  )}

                  {booking.fulfilled_by_admin && statusEquals(booking.status, 'ASSIGNED') && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => updateAdminTripStatus(booking.id, 'IN_PROGRESS')}
                      disabled={statusUpdatingId === booking.id}
                    >
                      Démarrer la course
                    </Button>
                  )}

                  {booking.fulfilled_by_admin && statusEquals(booking.status, 'IN_PROGRESS') && (
                    <Button
                      size="sm"
                      className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
                      onClick={() => updateAdminTripStatus(booking.id, 'COMPLETED')}
                      disabled={statusUpdatingId === booking.id}
                    >
                      Clôturer la course
                    </Button>
                  )}

                  {(statusEquals(booking.status, 'QUOTE_ACCEPTED') || statusEquals(booking.status, 'ORDER_ISSUED')) && (
                    <Button size="sm" className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]" onClick={() => openAssignDialog(booking)} data-testid={`assign-btn-${booking.id}`}>
                      <CarSimple size={16} className="mr-1" />Assigner à un chauffeur
                    </Button>
                  )}

                  {booking.status === 'cancellation_requested' && (
                    <>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openCancellationDialog(booking, 'approve')}>
                        Approuver annulation
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={() => openCancellationDialog(booking, 'reject')}>
                        Refuser
                      </Button>
                    </>
                  )}

                  {(statusEquals(booking.status, 'DRAFT') || statusEquals(booking.status, 'QUOTE_SENT') || statusEquals(booking.status, 'QUOTE_ACCEPTED') || statusEquals(booking.status, 'ORDER_ISSUED') || statusEquals(booking.status, 'ASSIGNED')) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                      onClick={() => openAdminCancelDialog(booking)}
                    >
                      Annuler la course
                    </Button>
                  )}
                </div>
              </div>

              {paymentPending && statusEquals(booking.status, 'DRAFT') && (
                <p className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                  Paiement Stripe en attente de confirmation : cette réservation reste visible pour diagnostic mais ne peut pas encore être affectée.
                </p>
              )}
              {isBankTransferPending && isPostAssignmentStatus && (
                <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Course affectée avec virement bancaire : paiement toujours en attente.
                </p>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-green-400 mt-1" />
                  <div>
                    <p className="text-xs text-[#A1A1AA]">Depart</p>
                    <p className="text-sm">{booking.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-red-400 mt-1" />
                  <div>
                    <p className="text-xs text-[#A1A1AA]">Arrivee</p>
                    <p className="text-sm">{booking.dropoff_address}</p>
                  </div>
                </div>
              </div>

              {(booking.vehicle_category_name || bookingDriverName || booking.cancellation_reason || booking.refund_amount != null || booking.disposition_hours != null || booking.fulfilled_by_admin || booking.distance_km != null) && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-1 text-sm">
                  {booking.distance_km != null && !isNaN(Number(booking.distance_km)) && (
                    <p className="text-[#A1A1AA]">📍 Distance : <span className="text-white font-medium">{Number(booking.distance_km).toFixed(1)} km</span>
                      {booking.estimated_price != null && !isNaN(Number(booking.estimated_price)) && (
                        <span className="ml-3">💶 Prix estimé : <span className="text-[#D4AF37] font-medium">{Number(booking.estimated_price).toFixed(2)} €</span></span>
                      )}
                    </p>
                  )}
                  {booking.vehicle_category_name && (
                    <p className="text-[#A1A1AA]">🚘 Gamme: <span className="text-white">{getCategoryDisplayName(booking.vehicle_category_name)}</span></p>
                  )}
                  {booking.disposition_hours != null && (
                    <p className="text-[#A1A1AA]">⏱ Mise à disposition: <span className="text-white">{booking.disposition_hours}h</span></p>
                  )}
                  <p className="text-[#A1A1AA]">💳 Mode de paiement: <span className="text-white">{formatPaymentMethodLabel(booking.payment_method)}</span></p>
                  {booking.transfer_type === 'disposition' && booking.estimated_price != null && (
                    <p className="text-[#D4AF37]">Tarif horaire réservé: {Number(booking.estimated_price).toFixed(2)}€</p>
                  )}
                  {booking.fulfilled_by_admin && (
                    <p className="text-purple-300">✓ Réalisée par admin — sans commission</p>
                  )}
                  {bookingDriverName && (
                    <p>
                      <CarSimple size={16} className="inline mr-2 text-[#D4AF37]" />
                      Chauffeur: <span className="text-[#D4AF37]">{bookingDriverName}</span>
                    </p>
                  )}
                  {booking.cancellation_reason && (
                    <p className="text-orange-300">Motif annulation: {booking.cancellation_reason}</p>
                  )}
                  {(booking.refund_amount != null || booking.refund_status || booking.stripe_refund_id || booking.refunded_at) && (
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 space-y-1">
                      {booking.refund_amount != null && (
                        <p className="text-green-300">Remboursement: {Number(booking.refund_amount).toFixed(2)}€</p>
                      )}
                      {booking.refund_status && (
                        <p className="text-xs text-emerald-200">Statut: {booking.refund_status}</p>
                      )}
                      {booking.stripe_refund_id && (
                        <p className="text-xs text-emerald-200 break-all">Stripe refund ID: {booking.stripe_refund_id}</p>
                      )}
                      {booking.refunded_at && (
                        <p className="text-xs text-emerald-200">Remboursée le: {new Date(booking.refunded_at).toLocaleString('fr-FR')}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 flex-wrap mt-4">
                <Link
                  to={`/${lang}/admin/bookings/${booking.id}`}
                  className="inline-flex items-center text-xs px-3 py-1.5 rounded border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
                >
                  🔍 Voir détail
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10"
                  onClick={() => openEditDialog(booking)}
                >
                  ✏️ Modifier
                </Button>
                {canDownloadQuote && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-sky-500/50 text-sky-300 hover:bg-sky-500/10"
                    onClick={() => downloadInvoicePdf(API_URL, booking.id, 'quote')}
                  >
                    <DownloadSimple size={14} className="mr-1" />Devis client
                  </Button>
                )}
                {(statusEquals(booking.status, 'ASSIGNED') || statusEquals(booking.status, 'ORDER_ISSUED')) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
                    onClick={() => downloadInvoicePdf(API_URL, booking.id, 'order')}
                  >
                    <DownloadSimple size={14} className="mr-1" />Bon de commande
                  </Button>
                )}
                {(statusEquals(booking.status, 'COMPLETED') || statusEquals(booking.status, 'INVOICED') || statusEquals(booking.status, 'PAID')) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-500/50 text-green-300 hover:bg-green-500/10"
                    onClick={() => downloadInvoicePdf(API_URL, booking.id, 'invoice')}
                  >
                    <DownloadSimple size={14} className="mr-1" />Facture client
                  </Button>
                )}
              </div>

              <BookingComments bookingId={booking.id} />
            </div>
          );
          })}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent className="bg-[#141414] border-white/10 max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Créer une nouvelle course</DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2">
              <p className="text-sm text-[#A1A1AA] mb-2">Choisir un client existant</p>
              <Select value={selectedClientId || 'manual'} onValueChange={handleSelectedClientChange}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue placeholder="-- Saisir manuellement --" />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  <SelectItem value="manual">-- Saisir manuellement --</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} - {client.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Nom du client *</p>
              <Input value={createForm.client_name} onChange={(e) => updateCreateField('client_name', e.target.value)} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Email du client *</p>
              <Input type="email" value={createForm.client_email} onChange={(e) => updateCreateField('client_email', e.target.value)} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Téléphone du client</p>
              <Input value={createForm.client_phone} onChange={(e) => updateCreateField('client_phone', e.target.value)} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Date de prise en charge *</p>
              <Input value={createForm.pickup_date} onChange={(e) => updateCreateField('pickup_date', e.target.value)} placeholder="dd/MM/yyyy" className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-[#A1A1AA] mb-2">Adresse de départ *</p>
              <Input ref={pickupRef} value={createForm.pickup_address} onChange={(e) => updateCreateField('pickup_address', e.target.value)} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-[#A1A1AA] mb-2">Adresse d'arrivée *</p>
              <Input ref={dropoffRef} value={createForm.dropoff_address} onChange={(e) => updateCreateField('dropoff_address', e.target.value)} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Heure de prise en charge *</p>
              <Select value={createForm.pickup_time} onValueChange={(v) => updateCreateField('pickup_time', v)}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue placeholder="Choisir une heure" />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10 max-h-64">
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Type de transfert *</p>
              <Select value={createForm.transfer_type} onValueChange={(v) => updateCreateField('transfer_type', v)}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  <SelectItem value="simple">Sens unique</SelectItem>
                  <SelectItem value="retour">Aller-retour</SelectItem>
                  <SelectItem value="disposition">Mise à disposition</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createForm.transfer_type === 'disposition' && (
              <div>
                <p className="text-sm text-[#A1A1AA] mb-2">Nombre d'heures</p>
                <Input
                  type="number"
                  min="1"
                  step="0.5"
                  value={createForm.disposition_hours}
                  onChange={(e) => updateCreateField('disposition_hours', e.target.value)}
                  placeholder="Ex: 4"
                  className="bg-[#1E1E1E] border-white/10"
                />
              </div>
            )}
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Gamme de véhicule</p>
              <Select value={createForm.vehicle_category_id || 'none'} onValueChange={(v) => updateCreateField('vehicle_category_id', v === 'none' ? '' : v)}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue placeholder="Choisir une gamme" />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  <SelectItem value="none">Aucune</SelectItem>
                  {vehicleCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {getCategoryDisplayName(category.name)} - {category.price_per_km.toFixed(2)}€/km
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Prix estimé (€)</p>
              <Input type="number" min="0" step="0.01" value={createForm.estimated_price} onChange={(e) => updateCreateField('estimated_price', e.target.value)} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Distance (km) {GOOGLE_MAPS_API_KEY ? <span className="text-xs text-green-400">— calculée auto</span> : null}</p>
              <Input
                type="number" min="0" step="0.1"
                value={createForm.distance_km}
                onChange={(e) => updateCreateField('distance_km', e.target.value)}
                placeholder={GOOGLE_MAPS_API_KEY ? 'Calculée automatiquement' : 'Ex: 15.5'}
                className="bg-[#1E1E1E] border-white/10"
              />
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-[#A1A1AA] mb-2">Déclenchement du paiement</p>
              <Select value={createForm.payment_mode} onValueChange={(v) => updateCreateField('payment_mode', v)}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  <SelectItem value="deferred">Paiement différé (sans règlement immédiat)</SelectItem>
                  <SelectItem value="immediate">Paiement immédiat (lien envoyé au client)</SelectItem>
                </SelectContent>
              </Select>
              {createForm.payment_mode === 'immediate' && (
                <p className="mt-1 text-xs text-yellow-400">Un email avec le récapitulatif de la course sera envoyé au client. S'il n'a pas encore de compte, il recevra également une invitation à s'inscrire.</p>
              )}
              {createForm.payment_mode === 'deferred' && (
                <p className="mt-1 text-xs text-[#A1A1AA]">La course sera créée sans paiement obligatoire. Le client pourra la consulter dans son espace s'il a un compte.</p>
              )}
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Mode de paiement</p>
              <Select value={createForm.payment_method || 'unspecified'} onValueChange={(value) => updateCreateField('payment_method', value === 'unspecified' ? '' : value)}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue placeholder="Choisir un mode" />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  <SelectItem value="unspecified">Non renseigné</SelectItem>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Statut de paiement</p>
              <Select value={createForm.payment_status} onValueChange={(value) => updateCreateField('payment_status', value)}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  {PAYMENT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-[#A1A1AA] mb-2">Notes</p>
              <textarea
                value={createForm.notes}
                onChange={(e) => updateCreateField('notes', e.target.value)}
                rows={3}
                className="w-full rounded-md bg-[#1E1E1E] border border-white/10 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              />
            </div>
          </div>
          <Button
            onClick={handleCreateBooking}
            disabled={creating || !canCreateBooking}
            className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
          >
            {creating ? 'Création...' : 'Créer la course'}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Assigner un chauffeur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-[#A1A1AA]">Course: {selectedBooking?.pickup_address} → {selectedBooking?.dropoff_address}</p>
            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                <SelectValue placeholder="Choisir un chauffeur" />
              </SelectTrigger>
              <SelectContent className="bg-[#1E1E1E] border-white/10">
                {drivers.filter((d) => d.is_available).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name} - {d.vehicle_model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDriver && (
              <p className="text-sm text-[#A1A1AA]">
                Chauffeur sélectionné : <span className="text-[#D4AF37]">{drivers.find((d) => d.id === selectedDriver)?.name || '—'}</span>
              </p>
            )}
            <Button onClick={assignDriver} disabled={!selectedDriver || assigning} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
              {assigning ? 'Assignation...' : 'Confirmer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cancellationDialogOpen} onOpenChange={setCancellationDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">
              {cancellationAction === 'approve' ? 'Approuver annulation' : 'Refuser annulation'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-[#A1A1AA]">Client: {selectedBooking?.client_name}</p>
            {cancellationAction === 'approve' && selectedBooking?.payment_status === 'paid' && (
              <div>
                <p className="text-sm text-[#A1A1AA] mb-2">Montant remboursé (€)</p>
                <p className="text-xs text-[#71717A] mb-2">Laisser vide pour rembourser la totalité.</p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="bg-[#1E1E1E] border-white/10"
                  placeholder="Ex: 25.00"
                />
              </div>
            )}
            <Button onClick={handleCancellationDecision} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
              Confirmer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={adminCancelDialogOpen} onOpenChange={setAdminCancelDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Annuler la course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-[#FAFAFA]">
              Cette course sera définitivement annulée. Le client sera notifié.
            </p>
            <p className="text-sm text-[#A1A1AA]">
              Client: {bookingToAdminCancel?.client_name}
            </p>
            <p className="text-sm text-[#A1A1AA]">
              Trajet: {bookingToAdminCancel?.pickup_address} → {bookingToAdminCancel?.dropoff_address}
            </p>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Motif d'annulation (optionnel)</p>
              <Input
                value={adminCancelReason}
                onChange={(e) => setAdminCancelReason(e.target.value)}
                className="bg-[#1E1E1E] border-white/10"
                placeholder="Ex: manque de chauffeurs disponibles"
              />
            </div>
            {bookingToAdminCancel?.payment_status === 'paid' && (
              <div>
                <p className="text-sm text-[#A1A1AA] mb-2">Montant remboursé (€)</p>
                <p className="text-xs text-[#71717A] mb-2">Laisser vide pour rembourser la totalité.</p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adminCancelRefundAmount}
                  onChange={(e) => setAdminCancelRefundAmount(e.target.value)}
                  className="bg-[#1E1E1E] border-white/10"
                  placeholder="Ex: 25.00"
                />
              </div>
            )}
            <Button
              onClick={handleAdminCancellation}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              Confirmer l'annulation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Modifier la réservation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Adresse de départ</p>
              <Input value={editForm.pickup_address || ''} onChange={(e) => setEditForm({ ...editForm, pickup_address: e.target.value })} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Adresse d'arrivée</p>
              <Input value={editForm.dropoff_address || ''} onChange={(e) => setEditForm({ ...editForm, dropoff_address: e.target.value })} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[#A1A1AA] mb-2">Date</p>
                <Input value={editForm.pickup_date || ''} onChange={(e) => setEditForm({ ...editForm, pickup_date: e.target.value })} className="bg-[#1E1E1E] border-white/10" placeholder="dd/MM/yyyy" />
              </div>
              <div>
                <p className="text-sm text-[#A1A1AA] mb-2">Heure</p>
                <Input value={editForm.pickup_time || ''} onChange={(e) => setEditForm({ ...editForm, pickup_time: e.target.value })} className="bg-[#1E1E1E] border-white/10" placeholder="HH:MM" />
              </div>
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Notes</p>
              <Input value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Prix estimé (€)</p>
              <Input type="number" min="0" step="0.01" value={editForm.estimated_price || ''} onChange={(e) => setEditForm({ ...editForm, estimated_price: e.target.value })} className="bg-[#1E1E1E] border-white/10" />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Mode de paiement</p>
              <Select value={editForm.payment_method || 'unspecified'} onValueChange={(value) => setEditForm({ ...editForm, payment_method: value === 'unspecified' ? '' : value })}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue placeholder="Choisir un mode" />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  <SelectItem value="unspecified">Non renseigné</SelectItem>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Statut de paiement</p>
              <Select value={editForm.payment_status || 'pending'} onValueChange={(value) => setEditForm({ ...editForm, payment_status: value })}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  {PAYMENT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={handleEditSubmit} disabled={editSubmitting} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
              {editSubmitting ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign self with vehicle selection dialog */}
      <Dialog open={assignSelfDialogOpen} onOpenChange={(o) => { setAssignSelfDialogOpen(o); if (!o) { setBookingToAssignSelf(null); setSelectedFleetVehicle(''); setAssignSelfDriverName(''); } }}>
        <DialogContent className="bg-[#141414] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Affecter à l'admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-[#A1A1AA]">
              Course : {bookingToAssignSelf?.pickup_address} → {bookingToAssignSelf?.dropoff_address}
            </p>
            {adminFleet.length > 0 ? (
              <div>
                <p className="text-sm text-[#A1A1AA] mb-2">Choisir un véhicule de la flotte (optionnel)</p>
                <Select value={selectedFleetVehicle || 'none'} onValueChange={(v) => setSelectedFleetVehicle(v === 'none' ? '' : v)}>
                  <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                    <SelectValue placeholder="Aucun véhicule sélectionné" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1E1E1E] border-white/10">
                    <SelectItem value="none">Aucun véhicule</SelectItem>
                    {adminFleet.filter((v) => v.is_active).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.brand} {v.model} — {v.plate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-[#A1A1AA]">Aucun véhicule dans la flotte admin.</p>
            )}
            <div>
              <label htmlFor="assign-self-driver-name" className="text-sm text-[#A1A1AA] mb-2 block">Nom du chauffeur affiché au client</label>
              <Input
                id="assign-self-driver-name"
                value={assignSelfDriverName}
                onChange={(e) => setAssignSelfDriverName(e.target.value)}
                className="bg-[#1E1E1E] border-white/10"
                placeholder="Ex: Oumar Bah"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button
              onClick={assignSelf}
              disabled={assigningSelf}
              className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold"
            >
              {assigningSelf ? 'Affectation...' : 'Confirmer l\'affectation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminBookings;
