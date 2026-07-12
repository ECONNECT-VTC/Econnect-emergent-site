import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CarSimple, CheckCircle, Clock, MapPin, Phone, Play, User, DownloadSimple } from '@phosphor-icons/react';
import API_URL from '@/config';
import BookingComments from '@/components/BookingComments';
import { downloadDriverDocPdf } from '@/utils/invoiceGenerator';
import { COURSE_STATUS_LABELS, COURSE_STATUS_STYLES, normalizeCourseStatus, statusEquals } from '../../utils/courseWorkflow';

const parseError = (error) => {
  const detail = error?.response?.data?.detail;
  if (!detail) return 'Erreur inconnue';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => `${e.loc?.slice(-1)[0] || 'champ'}: ${e.msg}`).join(' | ');
  }
  return 'Erreur inconnue';
};

const DriverDashboard = () => {
  const { lang = 'fr' } = useParams();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);
  const [filter, setFilter] = useState('ASSIGNED');
  const [error, setError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [bookingToWithdraw, setBookingToWithdraw] = useState(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/driver/bookings`, { withCredentials: true });
      setBookings(response.data);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const updateAvailability = async (available) => {
    try {
      await axios.put(`${API_URL}/api/driver/availability?is_available=${available}`, {}, { withCredentials: true });
      setIsAvailable(available);
    } catch (err) {
      setError(parseError(err));
    }
  };

  const updateBookingStatus = async (bookingId, status) => {
    if (actionLoadingId) return;
    setActionLoadingId(bookingId);
    setError('');
    try {
      await axios.put(`${API_URL}/api/driver/bookings/${bookingId}/status`, { status }, { withCredentials: true });
      fetchBookings();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const openWithdrawDialog = (booking) => {
    setBookingToWithdraw(booking);
    setWithdrawReason('');
    setWithdrawDialogOpen(true);
  };

  const handleDriverWithdrawal = async () => {
    if (!bookingToWithdraw) return;
    setError('');
    try {
      await axios.put(
        `${API_URL}/api/driver/bookings/${bookingToWithdraw.id}/cancel`,
        { cancellation_reason: withdrawReason || null },
        { withCredentials: true }
      );
      setWithdrawDialogOpen(false);
      setBookingToWithdraw(null);
      setWithdrawReason('');
      fetchBookings();
    } catch (err) {
      setError(parseError(err));
    }
  };

  const filteredBookings = filter === 'all' ? bookings : bookings.filter((b) => normalizeCourseStatus(b.status) === filter);

  const getStatusBadge = (status) => {
    const normalized = normalizeCourseStatus(status);
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${COURSE_STATUS_STYLES[normalized] || 'bg-gray-500/20'}`}>
        {COURSE_STATUS_LABELS[normalized] || normalized}
      </span>
    );
  };

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div
        className="glass rounded-xl p-6 mb-6 flex items-center justify-between"
        data-testid="availability-toggle"
      >
        <div className="flex items-center gap-3">
          <CarSimple size={24} className={isAvailable ? 'text-green-400' : 'text-red-400'} />
          <div>
            <p className="font-medium">Disponibilité</p>
            <p className="text-sm text-[#A1A1AA]">{isAvailable ? 'Disponible' : 'Indisponible'}</p>
          </div>
        </div>
        <Switch
          checked={isAvailable}
          onCheckedChange={updateAvailability}
          className="data-[state=checked]:bg-green-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-xl p-4 text-center cursor-pointer hover:border-[#D4AF37]/50 transition-all" onClick={() => setFilter('ASSIGNED')}>
          <p className="text-2xl font-bold text-blue-400">
            {bookings.filter((b) => statusEquals(b.status, 'ASSIGNED')).length}
          </p>
          <p className="text-sm text-[#A1A1AA]">Assignées</p>
        </div>
        <div className="glass rounded-xl p-4 text-center cursor-pointer hover:border-[#D4AF37]/50 transition-all" onClick={() => setFilter('IN_PROGRESS')}>
          <p className="text-2xl font-bold text-purple-400">
            {bookings.filter((b) => statusEquals(b.status, 'IN_PROGRESS')).length}
          </p>
          <p className="text-sm text-[#A1A1AA]">En cours</p>
        </div>
        <div className="glass rounded-xl p-4 text-center cursor-pointer hover:border-[#D4AF37]/50 transition-all" onClick={() => setFilter('COMPLETED')}>
          <p className="text-2xl font-bold text-green-400">
            {bookings.filter((b) => statusEquals(b.status, 'COMPLETED')).length}
          </p>
          <p className="text-sm text-[#A1A1AA]">Terminées</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA]'
            }`}
          >
            {s === 'all' ? 'Toutes' :
              s === 'ASSIGNED' ? 'Assignées' :
              s === 'IN_PROGRESS' ? 'En cours' : 'Terminées'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
      ) : filteredBookings.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <CarSimple size={48} className="text-[#A1A1AA] mx-auto mb-4" />
          <p className="text-[#A1A1AA]">Aucune course</p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="driver-bookings">
          {filteredBookings.map((booking) => (
            <div key={booking.id} className="glass rounded-xl p-6">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <Clock size={24} className="text-[#D4AF37]" />
                  <p className="font-medium">{booking.pickup_date} à {booking.pickup_time}</p>
                </div>
                {getStatusBadge(booking.status)}
              </div>
              <div className="bg-[#1E1E1E] rounded-lg p-4 mb-4">
                <p className="text-xs text-[#A1A1AA] uppercase mb-2">Client</p>
                <div className="flex items-center gap-3">
                  <User size={20} className="text-[#D4AF37]" />
                  <span>{booking.client_name}</span>
                </div>
                {booking.client_phone && (
                  <div className="flex items-center gap-3 mt-2">
                    <Phone size={20} className="text-[#D4AF37]" />
                    <a href={`tel:${booking.client_phone}`} className="text-[#D4AF37]">
                      {booking.client_phone}
                    </a>
                  </div>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-green-400 mt-1" />
                  <div>
                    <p className="text-xs text-[#A1A1AA]">Départ</p>
                    <p className="text-sm">{booking.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-red-400 mt-1" />
                  <div>
                    <p className="text-xs text-[#A1A1AA]">Arrivée</p>
                    <p className="text-sm">{booking.dropoff_address}</p>
                  </div>
                </div>
              </div>
              {booking.distance_km != null && !isNaN(Number(booking.distance_km)) && (
                <p className="text-xs text-[#A1A1AA] mb-4">
                  📍 Distance : <span className="text-white font-medium">{Number(booking.distance_km).toFixed(1)} km</span>
                  {booking.estimated_price != null && !isNaN(Number(booking.estimated_price)) && (
                    <span className="ml-3">💶 Prix estimé : <span className="text-[#D4AF37] font-medium">{Number(booking.estimated_price).toFixed(2)} €</span></span>
                  )}
                </p>
              )}
              {statusEquals(booking.status, 'ASSIGNED') && (
                <Button
                  onClick={() => updateBookingStatus(booking.id, 'IN_PROGRESS')}
                  disabled={actionLoadingId === booking.id}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
                >
                  <Play size={18} className="mr-2" />
                  {actionLoadingId === booking.id ? 'Démarrage en cours...' : 'Démarrer la course'}
                </Button>
              )}
              {statusEquals(booking.status, 'ASSIGNED') && (
                <Button
                  onClick={() => openWithdrawDialog(booking)}
                  variant="outline"
                  className="mt-2 w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                >
                  Je ne peux plus assurer cette course
                </Button>
              )}
              {statusEquals(booking.status, 'IN_PROGRESS') && (
                <Button
                  onClick={() => updateBookingStatus(booking.id, 'COMPLETED')}
                  disabled={actionLoadingId === booking.id}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60"
                >
                  <CheckCircle size={18} className="mr-2" />
                  {actionLoadingId === booking.id ? 'Finalisation en cours...' : 'Terminer la course'}
                </Button>
              )}
              {statusEquals(booking.status, 'COMPLETED') && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => downloadDriverDocPdf(API_URL, booking.id, 'driver')}
                    variant="outline"
                    className="border-green-500/50 text-green-400 hover:bg-green-500/10 text-xs"
                  >
                    <DownloadSimple size={15} className="mr-1" />Facture
                  </Button>
                  <Button
                    onClick={() => downloadDriverDocPdf(API_URL, booking.id, 'activity')}
                    variant="outline"
                    className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10 text-xs"
                  >
                    <DownloadSimple size={15} className="mr-1" />Relevé d'activité
                  </Button>
                </div>
              )}
              <Button
                onClick={() => window.open(`${API_URL}/api/driver/bookings/${booking.id}/order-pdf`, '_blank')}
                variant="outline"
                className="mt-3 w-full border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10"
              >
                Télécharger bon de commande
              </Button>

              <BookingComments bookingId={booking.id} />
              <Link
                to={`/${lang}/driver/bookings/${booking.id}`}
                className="mt-3 inline-flex items-center text-xs px-3 py-1.5 rounded border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
              >
                🔍 Voir détail
              </Link>
            </div>
          ))}
        </div>
      )}

      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Se retirer de la course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-[#FAFAFA]">
              Cette course sera remise en pool et réassignée à un autre chauffeur disponible.
            </p>
            <p className="text-sm text-[#A1A1AA]">
              Trajet: {bookingToWithdraw?.pickup_address} → {bookingToWithdraw?.dropoff_address}
            </p>
            <p className="text-sm text-[#A1A1AA]">
              Date: {bookingToWithdraw?.pickup_date} à {bookingToWithdraw?.pickup_time}
            </p>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Motif (optionnel)</p>
              <Input
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                className="bg-[#1E1E1E] border-white/10"
                placeholder="Ex: problème mécanique, indisponibilité imprévue"
              />
            </div>
            <Button
              onClick={handleDriverWithdrawal}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
            >
              Confirmer le retrait
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DriverDashboard;
