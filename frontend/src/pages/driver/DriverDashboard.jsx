import { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MapPin, Clock, User, Phone, CheckCircle, Play, CarSimple } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const DriverDashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);
  const [filter, setFilter] = useState('assigned');

  useEffect(() => { fetchBookings(); }, []);

  const fetchBookings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/driver/bookings`, { withCredentials: true });
      setBookings(response.data);
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
  };

  const updateAvailability = async (available) => {
    try {
      await axios.put(`${API_URL}/api/driver/availability?is_available=${available}`, {}, { withCredentials: true });
      setIsAvailable(available);
    } catch (error) { console.error('Error:', error); }
  };

  const updateBookingStatus = async (bookingId, status) => {
    try {
      await axios.put(`${API_URL}/api/driver/bookings/${bookingId}/status`, { status }, { withCredentials: true });
      fetchBookings();
    } catch (error) { console.error('Error:', error); }
  };

  const filteredBookings = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  const getStatusBadge = (status) => {
    const styles = { assigned: 'bg-blue-500/20 text-blue-400', in_progress: 'bg-purple-500/20 text-purple-400', completed: 'bg-green-500/20 text-green-400' };
    const labels = { assigned: 'Assignee', in_progress: 'En cours', completed: 'Terminee' };
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-500/20'}`}>{labels[status] || status}</span>;
  };

  return (
    <DashboardLayout title="Mes Courses">
      <div className="glass rounded-xl p-6 mb-6 flex items-center justify-between" data-testid="availability-toggle">
        <div className="flex items-center gap-3">
          <CarSimple size={24} className={isAvailable ? 'text-green-400' : 'text-red-400'} />
          <div>
            <p className="font-medium">Disponibilite</p>
            <p className="text-sm text-[#A1A1AA]">{isAvailable ? 'Disponible' : 'Indisponible'}</p>
          </div>
        </div>
        <Switch checked={isAvailable} onCheckedChange={updateAvailability} className="data-[state=checked]:bg-green-500" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{bookings.filter(b => b.status === 'assigned').length}</p>
          <p className="text-sm text-[#A1A1AA]">Assignees</p>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">{bookings.filter(b => b.status === 'in_progress').length}</p>
          <p className="text-sm text-[#A1A1AA]">En cours</p>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{bookings.filter(b => b.status === 'completed').length}</p>
          <p className="text-sm text-[#A1A1AA]">Terminees</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {['assigned', 'in_progress', 'completed', 'all'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA]'}`}>
            {s === 'all' ? 'Toutes' : s === 'assigned' ? 'Assignees' : s === 'in_progress' ? 'En cours' : 'Terminees'}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div> : filteredBookings.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center"><CarSimple size={48} className="text-[#A1A1AA] mx-auto mb-4" /><p className="text-[#A1A1AA]">Aucune course</p></div>
      ) : (
        <div className="space-y-4" data-testid="driver-bookings">
          {filteredBookings.map((booking) => (
            <div key={booking.id} className="glass rounded-xl p-6">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                <div className="flex items-center gap-3"><Clock size={24} className="text-[#D4AF37]" /><p className="font-medium">{booking.pickup_date} a {booking.pickup_time}</p></div>
                {getStatusBadge(booking.status)}
              </div>
              <div className="bg-[#1E1E1E] rounded-lg p-4 mb-4">
                <p className="text-xs text-[#A1A1AA] uppercase mb-2">Client</p>
                <div className="flex items-center gap-3"><User size={20} className="text-[#D4AF37]" /><span>{booking.client_name}</span></div>
                {booking.client_phone && <div className="flex items-center gap-3 mt-2"><Phone size={20} className="text-[#D4AF37]" /><a href={`tel:${booking.client_phone}`} className="text-[#D4AF37]">{booking.client_phone}</a></div>}
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="flex items-start gap-3"><MapPin size={20} className="text-green-400 mt-1" /><div><p className="text-xs text-[#A1A1AA]">Depart</p><p className="text-sm">{booking.pickup_address}</p></div></div>
                <div className="flex items-start gap-3"><MapPin size={20} className="text-red-400 mt-1" /><div><p className="text-xs text-[#A1A1AA]">Arrivee</p><p className="text-sm">{booking.dropoff_address}</p></div></div>
              </div>
              {booking.status === 'assigned' && <Button onClick={() => updateBookingStatus(booking.id, 'in_progress')} className="w-full bg-purple-600 hover:bg-purple-700"><Play size={18} className="mr-2" />Demarrer</Button>}
              {booking.status === 'in_progress' && <Button onClick={() => updateBookingStatus(booking.id, 'completed')} className="w-full bg-green-600 hover:bg-green-700"><CheckCircle size={18} className="mr-2" />Terminer</Button>}
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default DriverDashboard;
