import { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CalendarCheck, MapPin, User, CarSimple, CheckCircle } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [bookingsRes, driversRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/bookings`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/drivers`, { withCredentials: true })
      ]);
      setBookings(bookingsRes.data);
      setDrivers(driversRes.data);
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
  };

  const assignDriver = async () => {
    if (!selectedBooking || !selectedDriver) return;
    setAssigning(true);
    try {
      await axios.put(`${API_URL}/api/admin/bookings/${selectedBooking.id}/assign`, { driver_id: selectedDriver }, { withCredentials: true });
      setSelectedBooking(null);
      setSelectedDriver('');
      fetchData();
    } catch (error) { console.error('Error:', error); }
    finally { setAssigning(false); }
  };

  const filteredBookings = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  const getStatusBadge = (status) => {
    const styles = { pending: 'bg-yellow-500/20 text-yellow-400', assigned: 'bg-blue-500/20 text-blue-400', in_progress: 'bg-purple-500/20 text-purple-400', completed: 'bg-green-500/20 text-green-400', cancelled: 'bg-red-500/20 text-red-400' };
    const labels = { pending: 'En attente', assigned: 'Assignee', in_progress: 'En cours', completed: 'Terminee', cancelled: 'Annulee' };
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
  };

  return (
    <DashboardLayout title="Gestion des Reservations">
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'pending', 'assigned', 'in_progress', 'completed'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA]'}`}>
            {s === 'all' ? 'Toutes' : s === 'pending' ? 'En attente' : s === 'assigned' ? 'Assignees' : s === 'in_progress' ? 'En cours' : 'Terminees'}
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
                <div className="flex items-center gap-2">
                  {getStatusBadge(booking.status)}
                  {booking.status === 'pending' && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]" onClick={() => setSelectedBooking(booking)} data-testid={`assign-btn-${booking.id}`}>
                          <CarSimple size={16} className="mr-1" />Assigner
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-[#141414] border-white/10">
                        <DialogHeader><DialogTitle className="text-[#D4AF37]">Assigner un chauffeur</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <p className="text-sm text-[#A1A1AA]">Course: {booking.pickup_address} → {booking.dropoff_address}</p>
                          <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                            <SelectTrigger className="bg-[#1E1E1E] border-white/10"><SelectValue placeholder="Choisir un chauffeur" /></SelectTrigger>
                            <SelectContent className="bg-[#1E1E1E] border-white/10">
                              {drivers.filter(d => d.is_available).map((d) => (
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
                  )}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3"><MapPin size={20} className="text-green-400 mt-1" /><div><p className="text-xs text-[#A1A1AA]">Depart</p><p className="text-sm">{booking.pickup_address}</p></div></div>
                <div className="flex items-start gap-3"><MapPin size={20} className="text-red-400 mt-1" /><div><p className="text-xs text-[#A1A1AA]">Arrivee</p><p className="text-sm">{booking.dropoff_address}</p></div></div>
              </div>
              {booking.driver_name && <div className="mt-4 pt-4 border-t border-white/10"><p className="text-sm"><CarSimple size={16} className="inline mr-2 text-[#D4AF37]" />Chauffeur: <span className="text-[#D4AF37]">{booking.driver_name}</span></p></div>}
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default AdminBookings;
