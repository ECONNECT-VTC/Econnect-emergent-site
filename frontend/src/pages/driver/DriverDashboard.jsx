import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CarSimple, CheckCircle, Clock, MapPin, Phone, Play, User } from '@phosphor-icons/react';
import API_URL from '@/config';
import BookingComments from '@/components/BookingComments';

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
  const [filter, setFilter] = useState('assigned');
  const [error, setError] = useState('');
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
    try {
      await axios.put(`${API_URL}/api/driver/bookings/${bookingId}/status`, { status }, { withCredentials: true });
      fetchBookings();
    } catch (err) {
      setError(parseError(err));
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

  const filteredBookings = filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const getStatusBadge = (status) => {
    const styles = {
      assigned: 'bg-blue-500/20 text-blue-400',
      in_progress: 'bg-purple-500/20 text-purple-400',
      completed: 'bg-green-500/20 text-green-400'
    };
    const labels = {
      assigned: 'Assignée',
      in_progress: 'En cours',
      completed: 'Terminée'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-500/20'}`}>
        {labels[status] || status}
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
        <div className="glass rounded-xl p-4 text-center cursor-pointer hover:border-[#D4AF37]/50 transition-all" onClick={() => setFilter('assigned')}>
          <p className="text-2xl font-bold text-blue-400">
            {bookings.filter((b) => b.status === 'assigned').length}
          </p>
          <p className="text-sm text-[#A1A1AA]">Assignées</p>
        </div>
        <div className="glass rounded-xl p-4 text-center cursor-pointer hover:border-[#D4AF37]/50 transition-all" onClick={() => setFilter('in_progress')}>
          <p className="text-2xl font-bold text-purple-400">
            {bookings.filter((b) => b.status === 'in_progress').length}
          </p>
          <p className="text-sm text-[#A1A1AA]">En cours</p>
        </div>
        <div className="glass rounded-xl p-4 text-center cursor-pointer hover:border-[#D4AF37]/50 transition-all" onClick={() => setFilter('completed')}>
          <p className="text-2xl font-bold text-green-400">
            {bookings.filter((b) => b.status === 'completed').length}
          </p>
          <p className="text-sm text-[#A1A1AA]">Terminées</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {['assigned', 'in_progress', 'completed', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA]'
            }`}
          >
            {s === 'all' ? 'Toutes' :
              s === 'assigned' ? 'Assignées' :
              s === 'in_progress' ? 'En cours' : 'Terminées'}
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
              {booking.status === 'assigned' && (
                <Button
                  onClick={() => updateBookingStatus(booking.id, 'in_progress')}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  <Play size={18} className="mr-2" />Démarrer
                </Button>
              )}
              {booking.status === 'assigned' && (
                <Button
                  onClick={() => openWithdrawDialog(booking)}
                  variant="outline"
                  className="mt-2 w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                >
                  Je ne peux plus assurer cette course
                </Button>
              )}
              {booking.status === 'in_progress' && (
                <Button
                  onClick={() => updateBookingStatus(booking.id, 'completed')}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle size={18} className="mr-2" />Terminer
                </Button>
              )}
              <Button
                onClick={() => window.open(`${API_URL}/api/driver/bookings/${booking.id}/order-pdf`, '_blank')}
                variant="outline"
                className="mt-3 w-full border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10"
              >
                Télécharger bon de commande
              </Button>

              <BookingComments bookingId={booking.id} />
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
