import { useMemo, useState } from 'react';
import { useInvoices } from '@/hooks/useInvoices';
import { formatCurrency } from '@/utils/invoiceUtils';
import { downloadInvoicePdf } from '@/utils/invoiceGenerator';
import API_URL from '@/config';
import LogoDisplay from '@/components/LogoDisplay';

const ADMIN_DOCS = [
  { type: 'quote', label: 'Devis client', icon: '📄', color: 'text-sky-300' },
  { type: 'order', label: 'Bon de réservation', icon: '📋', color: 'text-purple-300' },
  { type: 'commission', label: 'Facture commission', icon: '💼', color: 'text-yellow-300' },
  { type: 'activity', label: 'Relevé d’activité', icon: '📊', color: 'text-blue-300' },
  { type: 'invoice', label: 'Facture client', icon: '🧾', color: 'text-green-300' },
];

const AdminDocuments = () => {
  const { bookings, loading, error, stats } = useInvoices();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [openId, setOpenId] = useState(null);

  const rows = useMemo(() => {
    const lower = search.toLowerCase();

    return bookings.filter((row) => {
      if (lower) {
        const haystack = `${row.client_name} ${row.driver_name || ''} ${row.pickup_address} ${row.dropoff_address}`.toLowerCase();
        if (!haystack.includes(lower)) return false;
      }
      if (dateFrom) {
        const rd = new Date(row.created_at);
        if (rd < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const rd = new Date(row.created_at);
        if (rd > new Date(dateTo + 'T23:59:59')) return false;
      }
      return true;
    });
  }, [bookings, search, dateFrom, dateTo]);

  const statCards = [
    { label: '💰 Total facturé (TTC)', value: formatCurrency(stats.totalClient) },
    { label: '💼 Commissions perçues (TTC)', value: formatCurrency(stats.totalCommission) },
    { label: '🚗 Versé aux chauffeurs', value: formatCurrency(stats.totalDriver) },
    { label: '📄 Courses facturées', value: stats.count },
  ];

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="bg-[#141414] border border-[#D4AF37]/30 rounded-xl p-5 mb-6">
        <LogoDisplay className="h-[46px] w-[180px]" priority />
        <p className="text-[#A1A1AA] text-sm mt-2">Section Admin — Gestion documentaire complète</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {statCards.map((c) => (
          <div key={c.label} className="bg-[#141414] rounded-xl border border-white/10 p-5">
            <p className="text-[#A1A1AA] text-sm">{c.label}</p>
            <p className="text-xl font-bold mt-2 text-[#D4AF37]">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="bg-[#141414] border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-[#A1A1AA] w-48"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="bg-[#141414] border border-white/10 rounded px-3 py-2 text-sm text-white w-36"
        />
        <span className="text-[#A1A1AA] text-sm">→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="bg-[#141414] border border-white/10 rounded px-3 py-2 text-sm text-white w-36"
        />
      </div>

      {/* Table */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-[#A1A1AA] border-b border-white/10">
              <th className="py-3">Course</th>
              <th>Client</th>
              <th>Chauffeur</th>
              <th>Trajet</th>
              <th>Date</th>
              <th>Montant TTC</th>
              <th>Documents</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 font-mono text-[#D4AF37] text-xs">{row.id ? `${row.id.slice(0, 8)}…` : '—'}</td>
                <td>{row.client_name}</td>
                <td>{row.driver_name || '—'}</td>
                <td className="text-xs text-[#A1A1AA]">
                  {row.pickup_address}<br /><span className="text-[#FAFAFA]">→ {row.dropoff_address}</span>
                </td>
                <td className="text-[#A1A1AA]">{new Date(row.created_at).toLocaleDateString('fr-FR')}</td>
                <td className="font-mono font-semibold">{formatCurrency(row.price_ttc)}</td>
                <td className="relative">
                  <button
                    onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    className="px-3 py-1.5 rounded bg-[#D4AF37] text-[#0A0A0A] text-xs font-semibold hover:bg-[#F0C74A] flex items-center gap-1 whitespace-nowrap"
                  >
                    📂 Consulter les documents {openId === row.id ? '▲' : '▾'}
                  </button>
                  {openId === row.id && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-white/10 bg-[#1E1E1E] py-1 shadow-xl">
                      {ADMIN_DOCS.map((doc) => (
                        <button
                          key={doc.type}
                          onClick={() => downloadInvoicePdf(API_URL, row.id, doc.type)}
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
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#A1A1AA]">Aucun document trouvé</td>
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

export default AdminDocuments;
