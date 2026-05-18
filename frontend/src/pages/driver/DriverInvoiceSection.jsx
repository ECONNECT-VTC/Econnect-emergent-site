import { useMemo, useState } from 'react';
import { useDriverInvoices } from '@/hooks/useInvoices';
import { formatCurrency } from '@/utils/invoiceUtils';
import { downloadDriverDocPdf } from '@/utils/invoiceGenerator';
import API_URL from '@/config';
import LogoDisplay from '@/components/LogoDisplay';

const DRIVER_DOCS = [
  { type: 'order', label: 'Bon de commande', icon: '📋', color: 'text-purple-300' },
  { type: 'commission', label: 'Facture commission', icon: '💼', color: 'text-yellow-300' },
  { type: 'activity', label: 'Relevé d’activité', icon: '📊', color: 'text-blue-300' },
];

const DriverInvoiceSection = () => {
  const { invoices, loading, error, totalEarned } = useDriverInvoices();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    if (!lower) return invoices;
    return invoices.filter((inv) =>
      `${inv.client_name} ${inv.pickup_address} ${inv.dropoff_address}`.toLowerCase().includes(lower)
    );
  }, [invoices, search]);

  const avgEarning = invoices.length > 0 ? totalEarned / invoices.length : 0;

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="bg-[#141414] border border-[#D4AF37]/30 rounded-xl p-5 mb-6">
        <LogoDisplay className="h-[150px]" priority />
        <p className="text-[#A1A1AA] text-sm mt-2">Section Chauffeur — Gestion de vos documents de course</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#141414] rounded-xl border border-[#D4AF37]/20 p-5">
          <p className="text-[#A1A1AA] text-sm">Total cumulé</p>
          <p className="text-2xl font-bold text-[#D4AF37] mt-2">{formatCurrency(totalEarned)}</p>
        </div>
        <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
          <p className="text-[#A1A1AA] text-sm">Nombre de courses</p>
          <p className="text-2xl font-bold mt-2">{invoices.length}</p>
        </div>
        <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
          <p className="text-[#A1A1AA] text-sm">Gain moyen / course</p>
          <p className="text-2xl font-bold mt-2 text-green-400">{formatCurrency(avgEarning)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par client, adresse…"
          className="bg-[#141414] border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-[#A1A1AA] w-72"
        />
      </div>

      {/* Table */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="text-left text-[#A1A1AA] border-b border-white/10">
              <th className="py-3">N° Course</th>
              <th>Client</th>
              <th>Trajet</th>
              <th>Date</th>
              <th>Montant course TTC</th>
              <th>Mon gain (HT)</th>
              <th>Documents</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.map((inv) => (
              <tr key={inv.booking_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 font-mono text-[#D4AF37] text-xs">{`${inv.booking_id?.slice(0, 8) ?? '—'}…`}</td>
                <td>{inv.client_name}</td>
                <td className="text-xs text-[#A1A1AA]">
                  {inv.pickup_address}<br />
                  <span className="text-[#FAFAFA]">→ {inv.dropoff_address}</span>
                </td>
                <td className="text-[#A1A1AA]">
                  {inv.pickup_date} {inv.pickup_time}
                </td>
                <td className="font-mono">{formatCurrency(inv.price_ttc)}</td>
                <td className="font-mono font-semibold text-green-400">{formatCurrency(inv.driver_earning)}</td>
                <td className="relative">
                  <button
                    onClick={() => setOpenId(openId === inv.booking_id ? null : inv.booking_id)}
                    className="px-3 py-1.5 rounded bg-[#D4AF37] text-[#0A0A0A] text-xs font-semibold hover:bg-[#F0C74A] flex items-center gap-1 whitespace-nowrap"
                  >
                    📂 Consulter les documents {openId === inv.booking_id ? '▲' : '▾'}
                  </button>
                  {openId === inv.booking_id && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-white/10 bg-[#1E1E1E] py-1 shadow-xl">
                      {DRIVER_DOCS.map((doc) => (
                        <button
                          key={doc.type}
                          onClick={() => downloadDriverDocPdf(API_URL, inv.booking_id, doc.type)}
                          className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs hover:bg-white/5 ${doc.color}`}
                        >
                          <span>{doc.icon}</span>
                          <span>{doc.label}</span>
                          <span className="ml-auto text-[#A1A1AA]">📥</span>
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#A1A1AA]">Aucune course disponible</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#A1A1AA]">Chargement…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DriverInvoiceSection;
