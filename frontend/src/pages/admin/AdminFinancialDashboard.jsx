import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';

const formatAmount = (value) => `${(value || 0).toFixed(2)}€`;
const MAX_RECENT_BOOKINGS = 10;

const AdminFinancialDashboard = () => {
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, bookingsRes] = await Promise.all([
          axios.get(`${API_URL}/api/admin/financial/stats`, { withCredentials: true }),
          axios.get(`${API_URL}/api/admin/bookings?status=completed`, { withCredentials: true })
        ]);
        setStats(statsRes.data);
        setBookings((bookingsRes.data || []).slice(0, MAX_RECENT_BOOKINGS));
      } catch (error) {
        console.error('Failed to fetch financial data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const commissionRate = stats?.commission_rate || 0.1;

  const bookingRows = useMemo(() => bookings.map((booking) => {
    const priceTtc = Number(booking.estimated_price || 0);
    const commissionTtc = priceTtc * commissionRate;
    const driverEarning = priceTtc - commissionTtc;

    return {
      ...booking,
      priceTtc,
      commissionTtc,
      driverEarning
    };
  }), [bookings, commissionRate]);

  if (loading) {
    return <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>;
  }

  const cards = [
    { label: '💰 CA Total TTC', value: formatAmount(stats?.total_revenue_ttc) },
    { label: '📊 CA Total HT', value: formatAmount(stats?.total_revenue_ht) },
    { label: '🏛️ TVA Client (10%) collectée', value: formatAmount(stats?.total_tva_client) },
    { label: '💼 Commissions TTC perçues', value: formatAmount(stats?.total_commission_ttc) },
    { label: '🏛️ TVA Commission (20%) à reverser', value: formatAmount(stats?.total_tva_commission) },
    { label: '🚗 Total versé chauffeurs', value: formatAmount(stats?.total_driver_earnings) },
  ];

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-[#141414] rounded-xl border border-white/10 p-5">
            <p className="text-[#A1A1AA] text-sm">{card.label}</p>
            <p className="text-2xl font-bold mt-2 text-[#D4AF37]">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Dernières courses complétées</h2>
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="text-left text-[#A1A1AA] border-b border-white/10">
              <th className="py-3">Client</th>
              <th>Trajet</th>
              <th>Date</th>
              <th>Prix TTC</th>
              <th>Commission</th>
              <th>Gain chauffeur</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookingRows.map((booking) => (
              <tr key={booking.id} className="border-b border-white/5">
                <td className="py-3">{booking.client_name}</td>
                <td>{booking.pickup_address} → {booking.dropoff_address}</td>
                <td>{booking.pickup_date} {booking.pickup_time}</td>
                <td>{formatAmount(booking.priceTtc)}</td>
                <td>{formatAmount(booking.commissionTtc)}</td>
                <td className="text-green-400">{formatAmount(booking.driverEarning)}</td>
                <td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open(`${API_URL}/api/admin/invoices/${booking.id}/pdf`, '_blank')}
                      className="px-3 py-1 rounded bg-[#D4AF37] text-[#0A0A0A] font-medium"
                    >
                      Facture PDF
                    </button>
                    <button
                      onClick={() => window.open(`${API_URL}/api/admin/orders/${booking.id}/pdf`, '_blank')}
                      className="px-3 py-1 rounded border border-[#D4AF37] text-[#D4AF37]"
                    >
                      Bon PDF
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {bookingRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#A1A1AA]">Aucune course complétée</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminFinancialDashboard;
