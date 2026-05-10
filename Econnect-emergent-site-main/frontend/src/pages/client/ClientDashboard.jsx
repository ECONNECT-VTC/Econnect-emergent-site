import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { CalendarCheck, Car, Clock, CheckCircle } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ClientDashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/bookings/my`, { withCredentials: true });
        setBookings(response.data);
      } catch (error) {
        console.error('Error fetching bookings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, []);

  const stats = {
    total: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    assigned: bookings.filter(b => b.status === 'assigned' || b.status === 'in_progress').length,
    completed: bookings.filter(b => b.status === 'completed').length,
  };

  const recentBookings = bookings.slice(0, 3);

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      assigned: 'bg-blue-500/20 text-blue-400',
      in_progress: 'bg-purple-500/20 text-purple-400',
      completed: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-red-500/20 text-red-400',
    };
    const labels = {
      pending: 'En attente',
      assigned: 'Assignee',
      in_progress: 'En cours',
      completed: 'Terminee',
      cancelled: 'Annulee',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <DashboardLayout title="Mon Espace">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="client-stats">
        <div className="glass rounded-xl p-6">
          <CalendarCheck size={32} className="text-[#D4AF37] mb-3" />
          <p className="text-3xl font-bold">{stats.total}</p>
          <p className="text-[#A1A1AA] text-sm">Total courses</p>
        </div>
        <div className="glass rounded-xl p-6">
          <Clock size={32} className="text-yellow-400 mb-3" />
          <p className="text-3xl font-bold">{stats.pending}</p>
          <p className="text-[#A1A1AA] text-sm">En attente</p>
        </div>
        <div className="glass rounded-xl p-6">
          <Car size={32} className="text-blue-400 mb-3" />
          <p className="text-3xl font-bold">{stats.assigned}</p>
          <p className="text-[#A1A1AA] text-sm">En cours</p>
        </div>
        <div className="glass rounded-xl p-6">
          <CheckCircle size={32} className="text-green-400 mb-3" />
          <p className="text-3xl font-bold">{stats.completed}</p>
          <p className="text-[#A1A1AA] text-sm">Terminees</p>
        </div>
      </div>

      <div className="mb-8">
        <Button asChild className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold">
          <Link to="/client/new-booking" data-testid="new-booking-btn">
            <Car size={20} className="mr-2" />
            Nouvelle reservation
          </Link>
        </Button>
      </div>

      <div className="glass rounded-xl p-6" data-testid="recent-bookings">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold font-['Cormorant_Garamond']">Dernieres reservations</h2>
          <Link to="/client/bookings" className="text-[#D4AF37] hover:underline text-sm">Voir tout</Link>
        </div>

        {loading ? (
          <div className="text-center py-8 text-[#A1A1AA]">Chargement...</div>
        ) : recentBookings.length === 0 ? (
          <div className="text-center py-8 text-[#A1A1AA]">Aucune reservation</div>
        ) : (
          <div className="space-y-4">
            {recentBookings.map((booking) => (
              <div key={booking.id} className="bg-[#1E1E1E] rounded-lg p-4 border border-white/5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">{booking.pickup_date} a {booking.pickup_time}</p>
                    <p className="text-sm text-[#A1A1AA]">{booking.pickup_address}</p>
                    <p className="text-sm text-[#A1A1AA]">→ {booking.dropoff_address}</p>
                  </div>
                  {getStatusBadge(booking.status)}
                </div>
                {booking.driver_name && (
                  <p className="text-sm text-[#D4AF37] mt-2">Chauffeur: {booking.driver_name}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ClientDashboard;
