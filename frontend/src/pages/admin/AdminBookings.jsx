import { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarCheck, MapPin, User, CarSimple, CheckCircle } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const parseError = (error) => {
  const detail = error?.response?.data?.detail;
  if (!detail) return 'Erreur inconnue';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => `${e.loc?.slice(-1)[0] || 'champ'}: ${e.msg}`).join(' | ');
  }
  return 'Erreur inconnue';
};

const AdminBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [cancellationDialogOpen, setCancellationDialogOpen] = useState(false);
  const [cancellationAction, setCancellationAction] = useState('approve');
  const [refundAmount, setRefundAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [bookingsRes, driversRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/bookings`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/drivers`, { withCredentials: true })
      ]);
      setBookings(bookingsRes.data);
      setDrivers(driversRes.data);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const receiveBooking = async (bookingId) => {
    setError('');
    try {
      await axios.put(`${API_URL}/api/admin/bookings/${bookingId}/receive`, {}, { withCredentials: true });
      fetchData();
    } catch (err) {
      setError(parseError(err));
    }
  };

  const openAssignDialog = (booking) => {
    setSelectedBooking(booking);
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
      setError(parseError(err));
    } finally {
      setAssigning(false);
    }
  };

  const openCancellationDialog = (booking, action) => {
    setSelectedBooking(booking);
    setCancellationAction(action);
    setRefundAmount(booking.refund_amount?.toString() || '');
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

  const filteredBookings = filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      received: 'bg-blue-500/20 text-blue-300',
      assigned: 'bg-cyan-500/20 text-cyan-300',
      in_progress: 'bg-purple-500/20 text-purple-400',
      completed: 'bg-green-500/20 text-green-400',
      cancellation_requested: 'bg-orange-500/20 text-orange-400',
      cancelled: 'bg-red-500/20 text-red-400'
    };
    const labels = {
      pending: 'En attente',
      received: 'Réceptionnée',
      assigned: 'Assignée',
      in_progress: 'En cours',
      completed: 'Terminée',
      cancellation_requested: 'Annulation demandée',
      cancelled: 'Annulée'
    };
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{labels[status] || status}</span>;
  };

  return (
    <DashboardLayout title="Gestion des Reservations">
      {error && <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'pending', 'received', 'assigned', 'in_progress', 'completed', 'cancellation_requested', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA]'}`}>
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

      {loading ? <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div> : filteredBookings.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center"><CalendarCheck size={48} className="text-[#A1A1AA] mx-auto mb-4" /><p className="text-[#A1A1AA]">Aucune reservation</p></div>
      ) : (
        <div className="space-y-4" data-testid="admin-bookings">
          {filteredBookings.map((booking) => (
            <div key={booking.id} className="glass rounded-xl p-6">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1"><User size={18} className="text-[#D4AF37]" /><span className="font-medium">{booking.client_name}</span></div>
                  <p className="text-sm text-[#A1A1AA]">{booking.client_email}</p>
                  <p className="text-sm text-[#D4AF37]">{booking.pickup_date} - {booking.pickup_time}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {getStatusBadge(booking.status)}

                  {booking.status === 'pending' && (
                    <Button size="sm" className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]" onClick={() => receiveBooking(booking.id)}>
                      <CheckCircle size={16} className="mr-1" />Réceptionner
                    </Button>
                  )}

                  {booking.status === 'received' && (
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
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3"><MapPin size={20} className="text-green-400 mt-1" /><div><p className="text-xs text-[#A1A1AA]">Depart</p><p className="text-sm">{booking.pickup_address}</p></div></div>
                <div className="flex items-start gap-3"><MapPin size={20} className="text-red-400 mt-1" /><div><p className="text-xs text-[#A1A1AA]">Arrivee</p><p className="text-sm">{booking.dropoff_address}</p></div></div>
              </div>

              {(booking.driver_name || booking.cancellation_reason || booking.refund_amount != null) && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-1 text-sm">
                  {booking.driver_name && <p><CarSimple size={16} className="inline mr-2 text-[#D4AF37]" />Chauffeur: <span className="text-[#D4AF37]">{booking.driver_name}</span></p>}
                  {booking.cancellation_reason && <p className="text-orange-300">Motif annulation: {booking.cancellation_reason}</p>}
                  {booking.refund_amount != null && <p className="text-green-400">Remboursement: {Number(booking.refund_amount).toFixed(2)}€</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader><DialogTitle className="text-[#D4AF37]">Assigner un chauffeur</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-[#A1A1AA]">Course: {selectedBooking?.pickup_address} → {selectedBooking?.dropoff_address}</p>
            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger className="bg-[#1E1E1E] border-white/10"><SelectValue placeholder="Choisir un chauffeur" /></SelectTrigger>
              <SelectContent className="bg-[#1E1E1E] border-white/10">
                {drivers.filter((d) => d.is_available).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name} - {d.vehicle_model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {cancellationAction === 'approve' && (
              <div>
                <p className="text-sm text-[#A1A1AA] mb-2">Montant remboursé (€)</p>
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
    </DashboardLayout>
  );
};

export default AdminBookings;
