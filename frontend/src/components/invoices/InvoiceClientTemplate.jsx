import React from 'react';
import { formatDate, calculateDueDate, formatCurrency, formatInvoiceNumber } from '@/utils/invoiceUtils';
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
  const tvaRate = Math.round((booking.tva_client_rate ?? 0.2) * 100);

  return (
    <div className="bg-[#1E1E1E] border border-[#D4AF37]/20 rounded-lg shadow-2xl max-w-3xl mx-auto text-[#FAFAFA]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A0A0A] to-[#141414] px-8 py-6 border-b border-[#D4AF37]/30 rounded-t-lg">
        <div className="flex justify-between items-start">
          <div>
            <LogoDisplay className="h-[160px]" priority />
            <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mt-1">Service de Transport Privé Premium</p>
          </div>
          <div className="text-right">
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold">Facture Client</p>
            <p className="text-2xl font-bold text-[#D4AF37] font-mono mt-1">{invoiceNumber}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-[#A1A1AA]">
          <span>SIRET : <span className="text-[#FAFAFA] font-mono">{companySiret}</span></span>
          <span>N° VTC : <span className="text-[#FAFAFA] font-mono">{companyVtc}</span></span>
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
              <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-1">{label}</p>
              <p className="text-[#FAFAFA] font-semibold text-sm">{value}</p>
            </div>
          ))}
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-8 pb-6 border-b border-[#D4AF37]/20">
          <div>
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Émetteur</p>
            <p className="font-semibold">{companyName}</p>
            <p className="text-[#A1A1AA] text-sm mt-1">{companyAddress}</p>
            <p className="text-[#A1A1AA] text-sm">{companyEmail}</p>
          </div>
          <div>
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Facturé à</p>
            <p className="font-semibold">{booking.client_name}</p>
            <p className="text-[#A1A1AA] text-sm mt-1">{booking.client_email}</p>
          </div>
        </div>

        {/* Trip details */}
        <div className="pb-6 border-b border-[#D4AF37]/20">
          <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Détails du service</p>
          <div className="bg-[#141414] rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#A1A1AA]">Type de service</span>
              <span className="capitalize">{booking.transfer_type || 'VTC'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A1A1AA]">Départ</span>
              <span className="text-right max-w-[60%]">{booking.pickup_address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A1A1AA]">Destination</span>
              <span className="text-right max-w-[60%]">{booking.dropoff_address}</span>
            </div>
            <div className="flex justify-between border-t border-[#D4AF37]/20 pt-2 mt-2">
              <span className="text-[#A1A1AA]">Date / Heure</span>
              <span>{booking.pickup_date} à {booking.pickup_time}</span>
            </div>
          </div>
        </div>

        {/* Amounts table */}
        <div className="pb-6 border-b border-[#D4AF37]/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#D4AF37]">
                <th className="text-left py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Description</th>
                <th className="text-right py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Qté</th>
                <th className="text-right py-3 text-[#D4AF37] text-xs uppercase tracking-widest">P.U. HT</th>
                <th className="text-right py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Montant HT</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#D4AF37]/20">
                <td className="py-3">Service de transport – {booking.transfer_type || 'VTC'}</td>
                <td className="text-right">1</td>
                <td className="text-right font-mono">{formatCurrency(booking.price_ht)}</td>
                <td className="text-right font-mono font-semibold">{formatCurrency(booking.price_ht)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#A1A1AA]">Total HT</span>
              <span className="font-mono">{formatCurrency(booking.price_ht)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A1A1AA]">TVA ({tvaRate}%)</span>
              <span className="font-mono">{formatCurrency(booking.tva_client)}</span>
            </div>
          </div>
        </div>

        {/* Total */}
        <div className="bg-gradient-to-r from-[#D4AF37]/15 to-[#D4AF37]/5 border-2 border-[#D4AF37] rounded-lg p-5">
          <div className="flex justify-between items-center">
            <span className="text-[#D4AF37] font-bold uppercase tracking-widest">Total TTC</span>
            <span className="text-[#D4AF37] text-3xl font-bold font-mono">{formatCurrency(booking.price_ttc)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#D4AF37]/20 text-xs text-[#A1A1AA] space-y-1">
          <p>Paiement sous 30 jours. Tout retard entraîne des pénalités de 3× le taux légal.</p>
          <p>TVA non récupérable par le preneur – {companyName} assujetti à la TVA.</p>
          <p className="text-center text-[#D4AF37]/60 mt-4">{companyName} © {new Date().getFullYear()} — Merci de votre confiance.</p>
        </div>
      </div>
    </div>
  );
};

export default InvoiceClientTemplate;
