import React from 'react';
import {
  formatDate,
  calculateDueDate,
  formatCurrency,
  formatInvoiceNumber,
  getClientVatRate,
  CLIENT_TVA_RATES,
  computeHtFromTtc,
} from '@/utils/invoiceUtils';
import LogoDisplay from '@/components/LogoDisplay';

/**
 * InvoiceClientTemplate
 *
 * Display-only React component for a Facture Client.
 * Use window.print() to export as PDF.
 *
 * Props:
 *   booking  – completed booking row (from /api/admin/financial/completed-bookings)
 *   settings – commission/company settings
 */
const InvoiceClientTemplate = ({ booking, settings }) => {
  if (!booking) return null;

  const invoiceNumber = booking.client_invoice_number
    ? formatInvoiceNumber(booking.client_invoice_number)
    : '------';

  const invoiceDate = booking.created_at ? new Date(booking.created_at) : new Date();
  const dateStr = formatDate(invoiceDate);
  const dueStr = calculateDueDate(invoiceDate, 30);
  const companyName = settings?.company_name || 'ECONNECT VTC';
  const companyAddress = settings?.company_address || 'Paris, France';
  const companySiret = settings?.company_siret || 'À compléter';
  const companyVtc = settings?.company_vtc_number || 'À compléter';
  const companyEmail = settings?.company_email || 'contact@econnect-vtc.fr';
  const resolvedTvaRate = getClientVatRate(booking.transfer_type);
  const tvaRate = Math.round(resolvedTvaRate * 100);
  const resolvedPriceTtc = Number(booking.price_ttc || 0);
  const computedAmounts = computeHtFromTtc(resolvedPriceTtc, resolvedTvaRate);
  const resolvedPriceHt = computedAmounts.ht;
  const resolvedTvaAmount = computedAmounts.tva;
  const isDriverIssued = Boolean(booking.driver_id) && !booking.fulfilled_by_admin;
  const distanceKm = Number(booking.distance_km) > 0 ? Number(booking.distance_km) : null;
  const unitPriceHt = Number(booking.price_per_km) > 0
    ? Number(booking.price_per_km)
    : distanceKm
    ? Number(booking.price_ht || 0) / distanceKm
    : null;
  const linePriceHt = distanceKm && unitPriceHt
    ? distanceKm * unitPriceHt
    : Number(booking.price_ht || 0);

  const normalizePaymentMethod = () => {
    const raw = String(booking.payment_method || booking.notes || '').toLowerCase();
    if (raw.includes('cb') || raw.includes('carte')) return 'cb';
    if (raw.includes('cash') || raw.includes('espece') || raw.includes('espèce')) return 'cash';
    if (raw.includes('virement')) return 'virement';
    return null;
  };
  const paymentMethod = normalizePaymentMethod();

  return (
    <div className="bg-white border border-[#D4AF37] rounded-lg shadow max-w-3xl mx-auto text-[#111111]">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[#D4AF37] rounded-t-lg">
        <div className="flex justify-between items-start">
          <div>
            <LogoDisplay className="h-[160px]" priority />
            <p className="text-[#525252] text-xs uppercase tracking-widest mt-1">Service de Transport Privé Premium</p>
          </div>
          <div className="text-right">
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold">Facture Client</p>
            <p className="text-2xl font-bold text-[#D4AF37] font-mono mt-1">{invoiceNumber}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-[#525252]">
          <span>SIRET : <span className="text-[#111111] font-mono">{companySiret}</span></span>
          <span>N° VTC : <span className="text-[#111111] font-mono">{companyVtc}</span></span>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Dates */}
        <div className="grid grid-cols-3 gap-4">
          {[
            ['Date de facturation', dateStr],
            ['Conditions de paiement', '30 jours'],
            ["Date d'échéance", dueStr],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[#525252] text-xs uppercase tracking-widest mb-1">{label}</p>
              <p className="text-[#111111] font-semibold text-sm">{value}</p>
            </div>
          ))}
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-8 pb-6 border-b border-[#D4AF37]">
          <div>
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Émetteur</p>
            <p className="font-semibold">{companyName}</p>
            <p className="text-[#525252] text-sm mt-1">{companyAddress}</p>
            <p className="text-[#525252] text-sm">{companyEmail}</p>
          </div>
          <div>
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Facturé à</p>
            <p className="font-semibold">{booking.client_name}</p>
            <p className="text-[#525252] text-sm mt-1">{booking.client_email}</p>
          </div>
        </div>

        {/* Amounts table */}
        <div className="pb-6 border-b border-[#D4AF37]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#D4AF37]">
                <th className="text-left py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Désignation</th>
                <th className="text-right py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Nombre de km</th>
                <th className="text-right py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Tarif au km HT</th>
                <th className="text-right py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Prix HT</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#D4AF37]/40">
                <td className="py-3">Adresse de départ : {booking.pickup_address || 'N/A'}</td>
                <td className="text-right">—</td>
                <td className="text-right">—</td>
                <td className="text-right">—</td>
              </tr>
              <tr className="border-b border-[#D4AF37]/40">
                <td className="py-3">Adresse d'arrivée : {booking.dropoff_address || 'N/A'}</td>
                <td className="text-right font-mono">{distanceKm != null ? distanceKm.toFixed(2) : '—'}</td>
                <td className="text-right font-mono">{unitPriceHt != null ? formatCurrency(unitPriceHt) : '—'}</td>
                <td className="text-right font-mono font-semibold">{formatCurrency(linePriceHt)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4 border border-[#D4AF37] rounded-lg p-3 text-sm">
            <p className="text-[#525252]">Mode de paiement</p>
            <div className="mt-2 flex flex-wrap gap-4">
              <span>{paymentMethod === 'cb' ? '☑' : '☐'} CB</span>
              <span>{paymentMethod === 'cash' ? '☑' : '☐'} Espèces</span>
              <span>{paymentMethod === 'virement' ? '☑' : '☐'} Virement bancaire</span>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#525252]">Montant HT</span>
              <span className="font-mono">{formatCurrency(resolvedPriceHt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#525252]">Montant TVA ({tvaRate}%)</span>
              <span className="font-mono">{formatCurrency(resolvedTvaAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-[#D4AF37] pt-2">
              <span className="font-semibold text-[#D4AF37]">Total TTC</span>
              <span className="font-mono font-bold text-[#D4AF37]">{formatCurrency(resolvedPriceTtc)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#D4AF37] text-xs text-[#525252] space-y-1">
          <p>
            TVA appliquée : {resolvedTvaRate === CLIENT_TVA_RATES.disposition
              ? `${Math.round(CLIENT_TVA_RATES.disposition * 100)}% (mise à disposition)`
              : `${Math.round(CLIENT_TVA_RATES.standardCourse * 100)}% (course hors mise à disposition)`}.
          </p>
          {isDriverIssued && (
            <p className="font-semibold text-[#7A5A00]">
              Facture éditée par la société Econnect VTC pour la société à laquelle le chauffeur est rattaché.
            </p>
          )}
          <p>Paiement sous 30 jours. Tout retard entraîne des pénalités de 3× le taux légal.</p>
          <p>TVA non récupérable par le preneur – {companyName} assujetti à la TVA.</p>
          <p className="text-center text-[#D4AF37]/60 mt-4">{companyName} © {new Date().getFullYear()} — Merci de votre confiance.</p>
        </div>
      </div>
    </div>
  );
};

export default InvoiceClientTemplate;
