import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CalendarCheck, MapPin, PencilSimple } from '@phosphor-icons/react';
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

const ClientBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [error, setError] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({});

  const fetchBookings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/bookings/my`, { withCredentials: true });
      setBookings(response.data);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const requestCancellation = async () => {
    if (!selectedBooking) return;
    setError('');
    try {
      await axios.post(
        `${API_URL}/api/bookings/${selectedBooking.id}/cancel-request`,
        { cancellation_reason: cancellationReason || null },
        { withCredentials: true }
      );
      setDialogOpen(false);
      setSelectedBooking(null);
      setCancellationReason('');
      fetchBookings();
    } catch (err) {
      setError(parseError(err));
    }
  };

  const openEditDialog = (booking) => {
    setSelectedBooking(booking);
    setEditForm({
      pickup_address: booking.pickup_address,
      dropoff_address: booking.dropoff_address,
      pickup_date: booking.pickup_date,
      pickup_time: booking.pickup_time,
      notes: booking.notes || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    try {
      await axios.put(`${API_URL}/api/bookings/${selectedBooking.id}`, editForm, { withCredentials: true });
      setEditDialogOpen(false);
      fetchBookings();
    } catch (err) {
      setError(parseError(err));
    }
  };

  const filteredBookings = filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      received: 'bg-blue-500/20 text-blue-300',
      assigned: 'bg-cyan-500/20 text-cyan-300',
      in_progress: 'bg-purple-500/20 text-purple-400',
      completed: 'bg-green-500/20 text-green-400',
      cancellation_requested: 'bg-orange-500/20 text-orange-400',
      cancelled: 'bg-red-500/20 text-red-400',
    };
    const labels = {
      pending: 'En attente',
      received: 'Réceptionnée',
      assigned: 'Assignée',
      in_progress: 'En cours',
      completed: 'Terminée',
      cancellation_requested: 'Annulation demandée',
      cancelled: 'Annulée',
    };
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{labels[status] || status}</span>;
  };

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      {error && <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'pending', 'received', 'assigned', 'in_progress', 'completed', 'cancellation_requested', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'}`}>
            {s === 'all' ? 'Toutes' :
              s === 'pending' ? 'En attente' :
              s === 'received' ? 'Réceptionnées' :
              s === 'assigned' ? 'Assignées' :
              s === 'in_progress' ? 'En cours' :
              s === 'completed' ? 'Terminées' :
              s === 'cancellation_requested' ? 'Annulation demandée' : 'Annulées'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
      ) : filteredBookings.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <CalendarCheck size={48} className="text-[#A1A1AA] mx-auto mb-4" />
          <p className="text-[#A1A1AA]">Aucune reservation trouvee</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => (
            <div key={booking.id} className="glass rounded-xl p-6">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <CalendarCheck size={24} className="text-[#D4AF37]" />
                  <div>
                    <p className="font-medium">{booking.pickup_date}</p>
                    <p className="text-sm text-[#A1A1AA]">{booking.pickup_time}</p>
                  </div>
                </div>
                {getStatusBadge(booking.status)}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-green-400 mt-1" />
                  <div>
                    <p className="text-xs text-[#A1A1AA] uppercase">Depart</p>
                    <p className="text-sm">{booking.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-red-400 mt-1" />
                  <div>
                    <p className="text-xs text-[#A1A1AA] uppercase">Arrivee</p>
                    <p className="text-sm">{booking.dropoff_address}</p>
                  </div>
                </div>
              </div>
              {booking.driver_name && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-sm"><span className="text-[#A1A1AA]">Chauffeur:</span> <span className="text-[#D4AF37]">{booking.driver_name}</span></p>
                </div>
              )}

              {(booking.status === 'pending' || booking.status === 'received') && (
                <Button
                  onClick={() => openEditDialog(booking)}
                  variant="outline"
                  className="mt-4 w-full border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10"
                >
                  <PencilSimple size={16} className="mr-2" />✏️ Modifier
                </Button>
              )}

              {(booking.status === 'pending' || booking.status === 'assigned') && (
                <Button
                  onClick={() => { setSelectedBooking(booking); setCancellationReason(booking.cancellation_reason || ''); setDialogOpen(true); }}
                  className="mt-4 w-full bg-red-600 hover:bg-red-700"
                >
                  Demander annulation
                </Button>
              )}

              {booking.refund_amount != null && (
                <p className="mt-3 text-sm text-green-400">Remboursement: {Number(booking.refund_amount).toFixed(2)}€</p>
              )}

              <BookingComments bookingId={booking.id} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">✏️ Modifier la réservation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div>
              <p className="text-sm text-[#A1A1AA] mb-1">Date</p>
              <Input
                value={editForm.pickup_date || ''}
                onChange={(e) => setEditForm({ ...editForm, pickup_date: e.target.value })}
                className="bg-[#1E1E1E] border-white/10"
                placeholder="dd/MM/yyyy"
              />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-1">Heure</p>
              <Input
                value={editForm.pickup_time || ''}
                onChange={(e) => setEditForm({ ...editForm, pickup_time: e.target.value })}
                className="bg-[#1E1E1E] border-white/10"
                placeholder="HH:MM"
              />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-1">Adresse de départ</p>
              <Input
                value={editForm.pickup_address || ''}
                onChange={(e) => setEditForm({ ...editForm, pickup_address: e.target.value })}
                className="bg-[#1E1E1E] border-white/10"
              />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-1">Adresse d'arrivée</p>
              <Input
                value={editForm.dropoff_address || ''}
                onChange={(e) => setEditForm({ ...editForm, dropoff_address: e.target.value })}
                className="bg-[#1E1E1E] border-white/10"
              />
            </div>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-1">Notes</p>
              <textarea
                value={editForm.notes || ''}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
                className="w-full rounded-md bg-[#1E1E1E] border border-white/10 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              />
            </div>
            <Button onClick={handleEditSubmit} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
              Enregistrer les modifications
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Demander annulation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-[#A1A1AA]">Course: {selectedBooking?.pickup_address} → {selectedBooking?.dropoff_address}</p>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Motif (optionnel)</p>
              <Input
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="bg-[#1E1E1E] border-white/10"
                placeholder="Ex: changement de plan"
              />
            </div>
            <Button onClick={requestCancellation} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">Envoyer la demande</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientBookings;
