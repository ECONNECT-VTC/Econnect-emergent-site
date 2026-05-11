import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';

const DriverEarnings = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEarnings = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/driver/earnings`, { withCredentials: true });
        setRows(response.data || []);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEarnings();
  }, []);

  const totals = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + Number(row.driver_earning || 0), 0);
    const count = rows.length;
    const average = count > 0 ? total / count : 0;
    return { total, count, average };
  }, [rows]);

  const formatAmount = (value) => `${Number(value || 0).toFixed(2)}€`;

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
          <p className="text-[#A1A1AA] text-sm">Total gagné</p>
          <p className="text-2xl font-bold text-green-400 mt-2">{formatAmount(totals.total)}</p>
        </div>
        <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
          <p className="text-[#A1A1AA] text-sm">Nombre de courses</p>
          <p className="text-2xl font-bold mt-2">{totals.count}</p>
        </div>
        <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
          <p className="text-[#A1A1AA] text-sm">Moyenne par course</p>
          <p className="text-2xl font-bold mt-2">{formatAmount(totals.average)}</p>
        </div>
      </div>

      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-[#A1A1AA] border-b border-white/10">
              <th className="py-3">Trajet</th>
              <th>Date</th>
              <th>Prix TTC course</th>
              <th>Commission déduite</th>
              <th>Mon gain</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.map((row) => (
              <tr key={row.booking_id} className="border-b border-white/5">
                <td className="py-3">{row.pickup_address} → {row.dropoff_address}</td>
                <td>{row.pickup_date} {row.pickup_time}</td>
                <td>{formatAmount(row.price_ttc)}</td>
                <td>{formatAmount(row.commission_ttc)}</td>
                <td className="text-green-400 font-semibold">{formatAmount(row.driver_earning)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[#A1A1AA]">Aucun gain disponible</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[#A1A1AA]">Chargement...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DriverEarnings;
