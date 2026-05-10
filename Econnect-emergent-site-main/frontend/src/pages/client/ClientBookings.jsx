import { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { CalendarCheck, MapPin } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ClientBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/bookings/my`, { withCredentials: true });
        setBookings(response.data);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, []);

  const filteredBookings = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      assigned: 'bg-blue-500/20 text-blue-400',
      in_progress: 'bg-purple-500/20 text-purple-400',
      completed: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-red-500/20 text-red-400',
    };
    const labels = {
      pending: 'En attente', assigned: 'Assignee', in_progress: 'En cours',
      completed: 'Terminee', cancelled: 'Annulee',
    };
    return <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
  };

  return (
    <DashboardLayout title="Mes Reservations">
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'pending', 'assigned', 'in_progress', 'completed'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === s ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'}`}>
            {s === 'all' ? 'Toutes' : s === 'pending' ? 'En attente' : s === 'assigned' ? 'Assignees' : s === 'in_progress' ? 'En cours' : 'Terminees'}
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
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default ClientBookings;
