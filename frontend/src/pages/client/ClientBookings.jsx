import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CalendarCheck, MapPin, DownloadSimple } from '@phosphor-icons/react';
import API_URL from '@/config';
import BookingComments from '@/components/BookingComments';
import { downloadClientInvoicePdf } from '@/utils/invoiceGenerator';
import { getClientFacingDriverName } from '../../utils/driverDisplay';
import { COURSE_STATUS_LABELS, COURSE_STATUS_STYLES, isStatusAtOrAfter, normalizeCourseStatus, statusEquals } from '../../utils/courseWorkflow';

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
  const { lang = 'fr' } = useParams();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(searchParams.get('status') || 'all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [error, setError] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);

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
    setEditingBooking(booking);
    setEditForm({
      pickup_address: booking.pickup_address || '',
      dropoff_address: booking.dropoff_address || '',
      pickup_date: booking.pickup_date || '',
      pickup_time: booking.pickup_time || '',
      notes: booking.notes || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingBooking) return;
    setEditSubmitting(true);
    setError('');
    try {
      await axios.put(`${API_URL}/api/bookings/${editingBooking.id}`, editForm, { withCredentials: true });
      setEditDialogOpen(false);
      setEditingBooking(null);
      fetchBookings();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const isAwaitingPaymentBooking = (booking) => (
    booking?.payment_status === 'pending'
    && !statusEquals(booking?.status, 'DRAFT')
    && !statusEquals(booking?.status, 'QUOTE_SENT')
    && !statusEquals(booking?.status, 'cancelled')
  );

  const filteredBookings = filter === 'all'
    ? bookings
    : filter === 'awaiting_payment'
      ? bookings.filter((b) => isAwaitingPaymentBooking(b))
      : bookings.filter((b) => normalizeCourseStatus(b.status) === filter);

  const getStatusBadge = (booking) => {
    if (isAwaitingPaymentBooking(booking)) {
      return <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300">En attente de paiement</span>;
    }
    const normalized = normalizeCourseStatus(booking?.status);
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${COURSE_STATUS_STYLES[normalized] || 'bg-zinc-500/20 text-zinc-300'}`}>{COURSE_STATUS_LABELS[normalized] || normalized}</span>;
  };

  const getPaymentBadge = (paymentStatus) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-300',
      paid: 'bg-green-500/20 text-green-300',
      failed: 'bg-red-500/20 text-red-300',
      not_required: 'bg-zinc-500/20 text-zinc-300',
    };
    const labels = {
      pending: 'Paiement en attente',
      paid: 'Payée',
      failed: 'Paiement échoué',
      not_required: 'Sans paiement',
    };
    if (!paymentStatus) return null;
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[paymentStatus] || 'bg-zinc-500/20 text-zinc-300'}`}>{labels[paymentStatus] || paymentStatus}</span>;
  };

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      {error && <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'awaiting_payment', 'QUOTE_ACCEPTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'cancellation_requested', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'}`}>
            {s === 'all' ? 'Toutes' :
              s === 'awaiting_payment' ? 'En attente paiement' :
              s === 'QUOTE_ACCEPTED' ? 'Confirmées' :
              s === 'ASSIGNED' ? 'Assignées' :
              s === 'IN_PROGRESS' ? 'En cours' :
              s === 'COMPLETED' ? 'Terminées' :
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
                  <div className="flex items-center gap-2">
                    {getStatusBadge(booking)}
                    {getPaymentBadge(booking.payment_status)}
                  </div>
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
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-sm"><span className="text-[#A1A1AA]">Chauffeur:</span> <span className="text-[#D4AF37]">{getClientFacingDriverName(booking)}</span></p>
                </div>

                {(statusEquals(booking.status, 'DRAFT') || statusEquals(booking.status, 'ASSIGNED')) && (
                  <Button
                    onClick={() => { setSelectedBooking(booking); setCancellationReason(booking.cancellation_reason || ''); setDialogOpen(true); }}
                    className="mt-4 w-full bg-red-600 hover:bg-red-700"
                  >
                    Demander annulation
                  </Button>
                )}

                {(statusEquals(booking.status, 'DRAFT') || statusEquals(booking.status, 'QUOTE_SENT')) && (
                  <Button
                    onClick={() => openEditDialog(booking)}
                    variant="outline"
                    className="mt-2 w-full border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10"
                  >
                    ✏️ Modifier
                  </Button>
                )}

                {isStatusAtOrAfter(booking.status, 'COMPLETED') && (
                  <Button
                    onClick={() => downloadClientInvoicePdf(API_URL, booking.id, booking.status)}
                    variant="outline"
                    className="mt-3 w-full border-green-500/50 text-green-400 hover:bg-green-500/10"
                  >
                    <DownloadSimple size={16} className="mr-2" />Télécharger ma facture
                  </Button>
                )}

                <div className="mt-3">
                  <Link
                    to={`/${lang}/client/bookings/${booking.id}`}
                    className="inline-flex items-center text-xs px-3 py-1.5 rounded border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
                  >
                    🔍 Voir détail
                  </Link>
                </div>
                <BookingComments bookingId={booking.id} />
            </div>
          ))}
        </div>
      )}

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
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={handleEditSubmit} disabled={editSubmitting} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
              {editSubmitting ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientBookings;
