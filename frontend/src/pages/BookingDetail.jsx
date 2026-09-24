import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import API_URL from '@/config';
import { getCategoryDisplayName } from '@/utils/vehicleCategories';
import { formatPaymentMethodLabel, formatPaymentStatusLabel } from '@/utils/paymentUtils';
import { getClientFacingDriverName, shouldRenderAssignedDriverForAdmin } from '../utils/driverDisplay';
import { COURSE_STATUS_LABELS, COURSE_STATUS_STYLES, normalizeCourseStatus, statusEquals } from '../utils/courseWorkflow';
import {
  ArrowLeft,
  CalendarCheck,
  MapPin,
  Car,
  CurrencyEur,
  Clock,
  User,
  Phone,
  CarSimple,
  CheckCircle,
  Timer,
  Tag,
} from '@phosphor-icons/react';

const TRANSFER_TYPE_LABELS = {
  simple: 'Sens unique',
  retour: 'Aller-retour',
  disposition: 'Mise à disposition',
};

const BookingDetail = () => {
  const { bookingId, lang = 'fr' } = useParams();
  const { user } = useAuth();
  const userRole = user?.role;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        let response;
        if (userRole === 'admin') {
          response = await axios.get(`${API_URL}/api/admin/bookings/${bookingId}`, { withCredentials: true });
        } else if (userRole === 'driver') {
          response = await axios.get(`${API_URL}/api/driver/bookings/${bookingId}`, { withCredentials: true });
        } else {
          response = await axios.get(`${API_URL}/api/bookings/${bookingId}`, { withCredentials: true });
        }
        setBooking(response.data);
        try {
          const docsResponse = await axios.get(`${API_URL}/api/courses/${bookingId}/documents`, { withCredentials: true });
          setDocuments(Array.isArray(docsResponse.data) ? docsResponse.data : []);
        } catch {
          setDocuments([]);
        }
      } catch (err) {
        setError('Course introuvable ou accès non autorisé.');
      } finally {
        setLoading(false);
      }
    };
    if (userRole) fetchBooking();
  }, [bookingId, userRole]);

  const refreshBooking = async () => {
    let response;
    if (userRole === 'admin') {
      response = await axios.get(`${API_URL}/api/admin/bookings/${bookingId}`, { withCredentials: true });
    } else if (userRole === 'driver') {
      response = await axios.get(`${API_URL}/api/driver/bookings/${bookingId}`, { withCredentials: true });
    } else {
      response = await axios.get(`${API_URL}/api/bookings/${bookingId}`, { withCredentials: true });
    }
    setBooking(response.data);
    try {
      const docsResponse = await axios.get(`${API_URL}/api/courses/${bookingId}/documents`, { withCredentials: true });
      setDocuments(Array.isArray(docsResponse.data) ? docsResponse.data : []);
    } catch {
      setDocuments([]);
    }
  };

  const updateAdminTripStatus = async (status) => {
    setStatusUpdating(true);
    setError('');
    try {
      await axios.put(
        `${API_URL}/api/admin/bookings/${bookingId}/status`,
        { status },
        { withCredentials: true }
      );
      await refreshBooking();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Impossible de mettre à jour le statut.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const backPath = () => {
    if (userRole === 'admin') return `/${lang}/admin/bookings`;
    if (userRole === 'driver') return `/${lang}/driver`;
    return `/${lang}/client/bookings`;
  };

  if (loading) {
    return <div className="bg-[#0A0A0A] text-white min-h-full flex items-center justify-center"><div className="text-[#A1A1AA]">Chargement...</div></div>;
  }

  if (error || !booking) {
    return (
      <div className="bg-[#0A0A0A] text-white min-h-full">
        <Link to={backPath()} className="inline-flex items-center gap-2 text-[#A1A1AA] hover:text-[#D4AF37] mb-6 transition-colors">
          <ArrowLeft size={20} /> Retour
        </Link>
        <div className="glass rounded-xl p-12 text-center">
          <CalendarCheck size={48} className="text-[#A1A1AA] mx-auto mb-4" />
          <p className="text-[#A1A1AA]">{error || 'Course introuvable.'}</p>
        </div>
      </div>
    );
  }

  const normalizedStatus = normalizeCourseStatus(booking.status);
  const statusStyle = COURSE_STATUS_STYLES[normalizedStatus] || 'bg-gray-500/20 text-gray-400';
  const statusLabel = COURSE_STATUS_LABELS[normalizedStatus] || normalizedStatus;
  const documentTypeLabels = {
    quote: 'Devis',
    order_form: 'Bon de commande',
    invoice: 'Facture',
  };
  const shouldRenderDriverCard = userRole === 'admin'
    ? shouldRenderAssignedDriverForAdmin(booking)
    : true;
  const displayedDriverName = userRole === 'admin'
    ? (booking.driver_display_name || booking.driver_name)
    : getClientFacingDriverName(booking);

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <Link to={backPath()} className="inline-flex items-center gap-2 text-[#A1A1AA] hover:text-[#D4AF37] mb-6 transition-colors">
        <ArrowLeft size={20} /> Retour aux courses
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="glass rounded-xl p-6">
            <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold font-['Cormorant_Garamond'] text-[#D4AF37]">Détail de la course</h2>
                <p className="text-xs text-[#A1A1AA] mt-1">ID: {booking.id}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyle}`}>{statusLabel}</span>
            </div>

            {booking.fulfilled_by_admin && userRole === 'admin' && (
              <div className="mb-4 px-3 py-2 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-300 text-sm flex items-center gap-2">
                <CheckCircle size={16} />
                Course réalisée par l'admin — exonérée de commission
              </div>
            )}

            {userRole === 'admin' && booking.fulfilled_by_admin && statusEquals(booking.status, 'ASSIGNED') && (
              <button
                type="button"
                className="mb-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                onClick={() => updateAdminTripStatus('IN_PROGRESS')}
                disabled={statusUpdating}
              >
                Démarrer la course
              </button>
            )}

            {userRole === 'admin' && booking.fulfilled_by_admin && statusEquals(booking.status, 'IN_PROGRESS') && (
              <button
                type="button"
                className="mb-4 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-medium text-[#0A0A0A] hover:bg-[#F0C74A] disabled:opacity-60"
                onClick={() => updateAdminTripStatus('COMPLETED')}
                disabled={statusUpdating}
              >
                Clôturer la course
              </button>
            )}

            {/* Date / Time */}
            <div className="flex items-center gap-3 mb-4">
              <CalendarCheck size={20} className="text-[#D4AF37]" />
              <div>
                <p className="font-medium">{booking.pickup_date}</p>
                <p className="text-sm text-[#A1A1AA]">{booking.pickup_time}</p>
              </div>
            </div>

            {/* Addresses */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin size={20} className="text-green-400 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-[#A1A1AA] uppercase">Départ</p>
                  <p>{booking.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={20} className="text-red-400 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-[#A1A1AA] uppercase">Arrivée</p>
                  <p>{booking.dropoff_address}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Trip info */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">Informations trajet</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Car size={20} className="text-[#D4AF37]" />
                <div>
                  <p className="text-xs text-[#A1A1AA]">Type de transfert</p>
                  <p className="font-medium">{TRANSFER_TYPE_LABELS[booking.transfer_type] || booking.transfer_type}</p>
                </div>
              </div>
              {booking.disposition_hours != null && (
                <div className="flex items-center gap-3">
                  <Timer size={20} className="text-[#D4AF37]" />
                  <div>
                    <p className="text-xs text-[#A1A1AA]">Durée mise à disposition</p>
                    <p className="font-medium">{booking.disposition_hours}h</p>
                  </div>
                </div>
              )}
              {booking.vehicle_category_name && (
                <div className="flex items-center gap-3">
                  <CarSimple size={20} className="text-[#D4AF37]" />
                  <div>
                    <p className="text-xs text-[#A1A1AA]">Gamme véhicule</p>
                    <p className="font-medium">{getCategoryDisplayName(booking.vehicle_category_name)}</p>
                  </div>
                </div>
              )}
              {booking.distance_km != null && (
                <div className="flex items-center gap-3">
                  <Tag size={20} className="text-[#D4AF37]" />
                  <div>
                    <p className="text-xs text-[#A1A1AA]">Distance</p>
                    <p className="font-medium">{Number(booking.distance_km).toFixed(1)} km</p>
                  </div>
                </div>
              )}
            </div>
            {booking.notes && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-[#A1A1AA] mb-1">Notes</p>
                <p className="text-sm">{booking.notes}</p>
              </div>
            )}
          </div>

          {/* Client info */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">Client</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User size={20} className="text-[#D4AF37]" />
                <span>{booking.client_name}</span>
              </div>
              {booking.client_email && (
                <div className="flex items-center gap-3">
                  <span className="text-[#A1A1AA] text-sm">✉️ {booking.client_email}</span>
                </div>
              )}
              {booking.client_phone && (
                <div className="flex items-center gap-3">
                  <Phone size={20} className="text-[#D4AF37]" />
                  <a href={`tel:${booking.client_phone}`} className="text-[#D4AF37]">{booking.client_phone}</a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Price */}
          {booking.estimated_price != null && (
            <div className="glass rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CurrencyEur size={20} className="text-[#D4AF37]" />
                {booking.transfer_type === 'disposition' ? 'Tarif mise à disposition' : 'Prix estimé'}
              </h3>
              <p className="text-3xl font-bold text-[#D4AF37]">{Number(booking.estimated_price).toFixed(2)}€</p>
              {booking.transfer_type === 'disposition' && booking.disposition_hours != null && (
                <p className="text-xs text-[#A1A1AA] mt-2">Tarification calculée sur {booking.disposition_hours}h réservées.</p>
              )}
              {booking.fulfilled_by_admin && userRole === 'admin' && (
                <p className="text-xs text-purple-300 mt-2">Commission: 0€ (réalisée par admin)</p>
              )}
              {booking.refund_amount != null && (
                <p className="text-sm text-green-400 mt-2">Remboursement: {Number(booking.refund_amount).toFixed(2)}€</p>
              )}
              {booking.refund_status && (
                <p className="text-xs text-green-300 mt-1">Statut remboursement: {booking.refund_status}</p>
              )}
            </div>
          )}

          <div className="glass rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">Paiement</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[#A1A1AA]">Mode</span>
                <span>{formatPaymentMethodLabel(booking.payment_method)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#A1A1AA]">Statut</span>
                <span>{formatPaymentStatusLabel(booking.payment_status)}</span>
              </div>
            </div>
          </div>

          {/* Driver info */}
          {shouldRenderDriverCard && (
            <div className="glass rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">
                {userRole === 'admin' ? 'Chauffeur assigné' : 'Votre chauffeur'}
              </h3>
              <div className="flex items-center gap-3">
                <CarSimple size={20} className="text-[#D4AF37]" />
                <span className="text-[#D4AF37]">{displayedDriverName}</span>
              </div>
              {/* Vehicle info - show to all roles when admin vehicle is assigned */}
              {(booking.admin_vehicle_brand || booking.admin_vehicle_model || booking.admin_vehicle_plate) && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Car size={16} className="text-[#D4AF37]" />
                    <span className="text-sm font-medium text-[#D4AF37]">Véhicule</span>
                  </div>
                  <div className="space-y-1 text-sm text-[#A1A1AA]">
                    {(booking.admin_vehicle_brand || booking.admin_vehicle_model) && (
                      <p>{[booking.admin_vehicle_brand, booking.admin_vehicle_model].filter(Boolean).join(' ')}</p>
                    )}
                    {booking.admin_vehicle_plate && (
                      <p className="font-mono text-white/70">{booking.admin_vehicle_plate}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancellation info */}
          {(booking.cancellation_reason || booking.driver_cancellation_reason || booking.refund_amount != null || booking.refund_status || booking.stripe_refund_id || booking.refunded_at) && (
            <div className="glass rounded-xl p-6 border border-orange-500/30">
              <h3 className="text-lg font-semibold mb-4 text-orange-400">Annulation</h3>
              {booking.cancellation_reason && (
                <p className="text-sm text-[#A1A1AA]">Motif: {booking.cancellation_reason}</p>
              )}
              {booking.driver_cancellation_reason && (
                <p className="text-sm text-[#A1A1AA] mt-2">Retrait chauffeur: {booking.driver_cancellation_reason}</p>
              )}
              {(booking.refund_amount != null || booking.refund_status) && (
                <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 space-y-1">
                  {booking.refund_amount != null && (
                    <p className="text-sm text-emerald-300">
                      Montant remboursé: {Number(booking.refund_amount).toFixed(2)}€{booking.refund_currency ? ` (${booking.refund_currency})` : ''}
                    </p>
                  )}
                  {booking.refund_status && (
                    <p className="text-xs text-emerald-200">Statut: {booking.refund_status}</p>
                  )}
                  {booking.refunded_at && (
                    <p className="text-xs text-emerald-200">Date: {new Date(booking.refunded_at).toLocaleString('fr-FR')}</p>
                  )}
                  {userRole === 'admin' && booking.stripe_refund_id && (
                    <p className="text-xs text-emerald-200 break-all">Stripe refund ID: {booking.stripe_refund_id}</p>
                  )}
                  {userRole === 'admin' && booking.refund_initiated_by && (
                    <p className="text-xs text-emerald-200">Initié par: {booking.refund_initiated_by}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[#A1A1AA] mb-3">Chronologie</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#A1A1AA]">Créée le</span>
                <span>{new Date(booking.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              {booking.assigned_at && (
                <div className="flex justify-between">
                  <span className="text-[#A1A1AA]">Assignée le</span>
                  <span>{new Date(booking.assigned_at).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[#A1A1AA] mb-3">Documents</h3>
            {documents.length === 0 ? (
              <p className="text-sm text-[#A1A1AA]">Aucun document disponible.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
                    <div>
                      <p className="font-medium">{documentTypeLabels[doc.type] || doc.type}</p>
                      <p className="text-xs text-[#A1A1AA]">Statut: {doc.status}</p>
                    </div>
                    <button
                      type="button"
                      className="text-[#D4AF37] hover:underline text-xs"
                      onClick={() => window.open(`${API_URL}${doc.url}`, '_blank')}
                    >
                      Télécharger
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingDetail;
