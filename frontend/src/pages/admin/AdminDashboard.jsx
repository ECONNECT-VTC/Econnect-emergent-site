import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { CalendarCheck, CarSimple, Clock, Users } from '@phosphor-icons/react';
import API_URL from '@/config';

const AdminDashboard = () => {
  const { lang = 'fr' } = useParams();
  const [stats, setStats] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, bookingsRes] = await Promise.all([
          axios.get(`${API_URL}/api/admin/stats`, { withCredentials: true }),
          axios.get(`${API_URL}/api/admin/bookings?status=pending`, { withCredentials: true })
        ]);
        setStats(statsRes.data);
        setRecentBookings(bookingsRes.data.slice(0, 5));
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>;
  }

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="admin-stats">
        <Link to={`/${lang}/admin/bookings`} className="glass rounded-xl p-6 hover:border-[#D4AF37]/50 transition-all cursor-pointer block">
          <CalendarCheck size={32} className="text-[#D4AF37] mb-3" />
          <p className="text-3xl font-bold">{stats?.total_bookings || 0}</p>
          <p className="text-[#A1A1AA] text-sm">Total courses</p>
        </Link>
        <Link to={`/${lang}/admin/bookings?status=pending`} className="glass rounded-xl p-6 hover:border-[#D4AF37]/50 transition-all cursor-pointer block">
          <Clock size={32} className="text-yellow-400 mb-3" />
          <p className="text-3xl font-bold">{stats?.pending_bookings || 0}</p>
          <p className="text-[#A1A1AA] text-sm">En attente</p>
        </Link>
        <Link to={`/${lang}/admin/drivers`} className="glass rounded-xl p-6 hover:border-[#D4AF37]/50 transition-all cursor-pointer block">
          <CarSimple size={32} className="text-blue-400 mb-3" />
          <p className="text-3xl font-bold">{stats?.total_drivers || 0}</p>
          <p className="text-[#A1A1AA] text-sm">Chauffeurs</p>
        </Link>
        <Link to={`/${lang}/admin/clients`} className="glass rounded-xl p-6 hover:border-[#D4AF37]/50 transition-all cursor-pointer block">
          <Users size={32} className="text-green-400 mb-3" />
          <p className="text-3xl font-bold">{stats?.total_clients || 0}</p>
          <p className="text-[#A1A1AA] text-sm">Clients</p>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold font-['Cormorant_Garamond']">Courses en attente</h2>
            <Link to={`/${lang}/admin/bookings?status=pending`} className="text-[#D4AF37] hover:underline text-sm">Voir tout</Link>
          </div>
          {recentBookings.length === 0 ? (
            <p className="text-[#A1A1AA] text-center py-4">Aucune course en attente</p>
          ) : (
            <div className="space-y-3">
              {recentBookings.map((b) => (
                <Link key={b.id} to={`/${lang}/admin/bookings/${b.id}`} className="block bg-[#1E1E1E] rounded-lg p-4 hover:bg-[#252525] transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{b.client_name}</p>
                      <p className="text-sm text-[#A1A1AA]">{b.pickup_date} - {b.pickup_time}</p>
                    </div>
                    <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">En attente</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-xl p-6">
          <h2 className="text-xl font-bold font-['Cormorant_Garamond'] mb-6">Statistiques</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[#A1A1AA]">Chauffeurs disponibles</span>
              <span className="text-green-400 font-bold">{stats?.available_drivers || 0}</span>
            </div>
            <Link to={`/${lang}/admin/bookings?status=assigned`} className="flex justify-between items-center hover:text-[#D4AF37] transition-colors">
              <span className="text-[#A1A1AA]">Courses assignées</span>
              <span className="text-blue-400 font-bold">{stats?.assigned_bookings || 0}</span>
            </Link>
            <Link to={`/${lang}/admin/bookings?status=completed`} className="flex justify-between items-center hover:text-[#D4AF37] transition-colors">
              <span className="text-[#A1A1AA]">Courses terminées</span>
              <span className="text-[#D4AF37] font-bold">{stats?.completed_bookings || 0}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
