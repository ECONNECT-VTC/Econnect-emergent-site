import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import API_URL from '@/config';
const formatAmount = (value) => `${(Number(value) || 0).toFixed(2)}€`;
const MAX_RECENT_BOOKINGS = 50;

const parseError = (error) => {
  const detail = error?.response?.data?.detail;
  if (!detail) return 'Erreur inconnue';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => `${e.loc?.slice(-1)[0] || 'champ'}: ${e.msg}`).join(' | ');
  }
  return 'Erreur inconnue';
};

const AdminFinancialDashboard = () => {
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState('all');
  const [error, setError] = useState('');
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [commissionOverride, setCommissionOverride] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async (driverId = selectedDriver) => {
    try {
      const statsUrl = driverId !== 'all'
        ? `${API_URL}/api/admin/financial/stats?driver_id=${driverId}`
        : `${API_URL}/api/admin/financial/stats`;

      const [statsRes, bookingsRes, driversRes] = await Promise.all([
        axios.get(statsUrl, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/bookings?status=completed`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/drivers`, { withCredentials: true })
      ]);

      const fetchedBookings = bookingsRes.data || [];
      const filtered = driverId === 'all'
        ? fetchedBookings
        : fetchedBookings.filter((b) => b.driver_id === driverId);

      setStats(statsRes.data);
      setBookings(filtered.slice(0, MAX_RECENT_BOOKINGS));
      setDrivers(driversRes.data || []);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData('all');
  }, []);

  useEffect(() => {
    if (!loading) fetchData(selectedDriver);
  }, [selectedDriver]);

  const openAdjustModal = (booking) => {
    setSelectedBooking(booking);
    setCommissionOverride(booking.commission_override != null ? String(booking.commission_override) : '');
    setAdjustDialogOpen(true);
  };

  const saveCommissionOverride = async () => {
    if (!selectedBooking || commissionOverride === '') return;
    setSaving(true);
    setError('');
    try {
      await axios.put(
        `${API_URL}/api/admin/bookings/${selectedBooking.id}/commission`,
        { commission_override: Number(commissionOverride) },
        { withCredentials: true }
      );
      setAdjustDialogOpen(false);
      setSelectedBooking(null);
      setCommissionOverride('');
      fetchData(selectedDriver);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  };

  const commissionRate = stats?.commission_rate || 0.1;

  const bookingRows = useMemo(() => bookings.map((booking) => {
    const priceTtc = Number(booking.estimated_price || 0);
    const commissionTtc = booking.commission_override != null
      ? Number(booking.commission_override)
      : priceTtc * commissionRate;
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
      {error && <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>}

      <div className="mb-6 max-w-md">
        <label className="text-sm text-[#A1A1AA] block mb-2">Filtrer par chauffeur</label>
        <select
          value={selectedDriver}
          onChange={(e) => setSelectedDriver(e.target.value)}
          className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white"
        >
          <option value="all">Tous les chauffeurs</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>{driver.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-[#141414] rounded-xl border border-white/10 p-5">
            <p className="text-[#A1A1AA] text-sm">{card.label}</p>
            <p className="text-2xl font-bold mt-2 text-[#D4AF37]">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Courses complétées</h2>
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="text-left text-[#A1A1AA] border-b border-white/10">
              <th className="py-3">Client</th>
              <th>Chauffeur</th>
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
                <td>{booking.driver_name || '-'}</td>
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
                      onClick={() => openAdjustModal(booking)}
                      className="px-3 py-1 rounded border border-[#D4AF37] text-[#D4AF37]"
                    >
                      Ajuster commission
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {bookingRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[#A1A1AA]">Aucune course complétée</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Ajuster commission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-[#A1A1AA]">Course: {selectedBooking?.pickup_address} → {selectedBooking?.dropoff_address}</p>
            <div>
              <p className="text-sm text-[#A1A1AA] mb-2">Commission corrigée (€)</p>
              <Input
                type="number"
                step="0.01"
                value={commissionOverride}
                onChange={(e) => setCommissionOverride(e.target.value)}
                className="bg-[#1E1E1E] border-white/10"
                placeholder="Ex: 8.50"
              />
            </div>
            <Button onClick={saveCommissionOverride} disabled={saving || commissionOverride === ''} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminFinancialDashboard;
