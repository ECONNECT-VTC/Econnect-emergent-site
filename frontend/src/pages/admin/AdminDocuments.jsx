import { useMemo, useState } from 'react';
import { useInvoices } from '@/hooks/useInvoices';
import { formatCurrency, formatInvoiceNumber, invoiceTypeLabel } from '@/utils/invoiceUtils';
import { downloadInvoicePdf } from '@/utils/invoiceGenerator';
import API_URL from '@/config';
import LogoDisplay from '@/components/LogoDisplay';

const TABS = [
  { key: 'all', label: 'Tous' },
  { key: 'invoice', label: 'Factures Client' },
  { key: 'driver', label: 'Factures Chauffeur' },
  { key: 'commission', label: 'Commissions' },
];

const AdminDocuments = () => {
  const { bookings, loading, error, stats } = useInvoices();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const rows = useMemo(() => {
    const lower = search.toLowerCase();

    return bookings.flatMap((b) => {
      const types = tab === 'all'
        ? ['invoice', 'driver', 'commission']
        : [tab];

      return types.map((type) => ({
        ...b,
        invoiceType: type,
        invoiceNumber:
          type === 'invoice' ? b.client_invoice_number :
          type === 'driver' ? b.driver_invoice_number :
          b.commission_invoice_number,
        displayAmount:
          type === 'invoice' ? b.price_ttc :
          type === 'driver' ? b.driver_earning :
          b.commission_ttc,
      }));
    }).filter((row) => {
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
  }, [bookings, tab, search, dateFrom, dateTo]);

  const statCards = [
    { label: '💰 Total facturé (TTC)', value: formatCurrency(stats.totalClient) },
    { label: '💼 Commissions perçues (TTC)', value: formatCurrency(stats.totalCommission) },
    { label: '🚗 Versé aux chauffeurs', value: formatCurrency(stats.totalDriver) },
    { label: '📄 Courses facturées', value: stats.count },
  ];

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="bg-[#141414] border border-[#D4AF37]/30 rounded-xl p-5 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <LogoDisplay className="h-[150px]" priority />
          <p className="text-[#A1A1AA] text-sm mt-2">Section Admin — Gestion documentaire complète</p>
        </div>
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
        <div className="flex gap-2">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                tab === key ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#141414] text-[#A1A1AA] hover:bg-[#1E1E1E]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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
              <th className="py-3">N° Facture</th>
              <th>Type</th>
              <th>Client</th>
              <th>Chauffeur</th>
              <th>Trajet</th>
              <th>Date</th>
              <th>Montant</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.map((row, idx) => (
              <tr key={`${row.id}-${row.invoiceType}-${idx}`} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 font-mono text-[#D4AF37]">
                  {row.invoiceNumber ? formatInvoiceNumber(row.invoiceNumber) : '—'}
                </td>
                <td>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    row.invoiceType === 'invoice' ? 'bg-blue-500/20 text-blue-300' :
                    row.invoiceType === 'driver' ? 'bg-green-500/20 text-green-300' :
                    'bg-yellow-500/20 text-yellow-300'
                  }`}>
                    {invoiceTypeLabel(row.invoiceType)}
                  </span>
                </td>
                <td>{row.client_name}</td>
                <td>{row.driver_name || '—'}</td>
                <td className="text-xs text-[#A1A1AA]">
                  {row.pickup_address}<br /><span className="text-[#FAFAFA]">→ {row.dropoff_address}</span>
                </td>
                <td className="text-[#A1A1AA]">{new Date(row.created_at).toLocaleDateString('fr-FR')}</td>
                <td className="font-mono font-semibold">{formatCurrency(row.displayAmount)}</td>
                <td>
                  <button
                    onClick={() => downloadInvoicePdf(API_URL, row.id, row.invoiceType)}
                    className="px-3 py-1 rounded bg-[#D4AF37] text-[#0A0A0A] text-xs font-medium hover:bg-[#F0C74A]"
                  >
                    📥 PDF
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[#A1A1AA]">Aucun document trouvé</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[#A1A1AA]">Chargement…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDocuments;
