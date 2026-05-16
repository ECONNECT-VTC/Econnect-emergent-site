import React from 'react';
import { formatDate, calculateDueDate, formatCurrency, formatInvoiceNumber } from '@/utils/invoiceUtils';
import LogoDisplay from '@/components/LogoDisplay';

/**
 * InvoiceCommissionTemplate
 *
 * Display-only React component for a Facture Commission.
 * Shows the commission retained by ECONNECT VTC (admin only).
 *
 * Props:
 *   booking  – completed booking row (from /api/admin/financial/completed-bookings)
 *   settings – commission/company settings
 */
const InvoiceCommissionTemplate = ({ booking, settings }) => {
  if (!booking) return null;

  const invoiceNumber = booking.commission_invoice_number
    ? formatInvoiceNumber(booking.commission_invoice_number)
    : '------';

  const clientRef = booking.client_invoice_number
    ? formatInvoiceNumber(booking.client_invoice_number)
    : null;

  const driverRef = booking.driver_invoice_number
    ? formatInvoiceNumber(booking.driver_invoice_number)
    : null;

  const invoiceDate = booking.created_at ? new Date(booking.created_at) : new Date();
  const dateStr = formatDate(invoiceDate);
  const dueStr = calculateDueDate(invoiceDate, 30);
  const companyName = settings?.company_name || 'ECONNECT VTC';
  const companyAddress = settings?.company_address || 'Paris, France';
  const companySiret = settings?.company_siret || 'À compléter';
  const companyVtc = settings?.company_vtc_number || 'À compléter';
  const companyEmail = settings?.company_email || 'contact@econnect-vtc.fr';
  const commissionRate = Math.round((booking.commission_rate || settings?.commission_rate || 0.1) * 100);
  const tvaCommRate = Math.round((booking.tva_commission_rate || settings?.tva_commission_rate || 0.2) * 100);

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
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold">Facture Commission</p>
            <p className="text-2xl font-bold text-[#D4AF37] font-mono mt-1">{invoiceNumber}</p>
            <p className="text-[#A1A1AA] text-xs mt-1 italic">Document interne – Admin uniquement</p>
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
            ['Date', dateStr],
            ['Taux commission', `${commissionRate}%`],
            ['TVA commission', `${tvaCommRate}%`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-1">{label}</p>
              <p className="text-[#FAFAFA] font-semibold text-sm">{value}</p>
            </div>
          ))}
        </div>

        {/* References */}
        {(clientRef || driverRef) && (
          <div className="bg-[#141414] rounded-lg px-4 py-3 text-sm space-y-1">
            {clientRef && (
              <div>
                <span className="text-[#A1A1AA]">Réf. facture client : </span>
                <span className="text-[#D4AF37] font-mono font-semibold">{clientRef}</span>
              </div>
            )}
            {driverRef && (
              <div>
                <span className="text-[#A1A1AA]">Réf. facture chauffeur : </span>
                <span className="text-green-400 font-mono font-semibold">{driverRef}</span>
              </div>
            )}
          </div>
        )}

        {/* Parties */}
        <div className="grid grid-cols-2 gap-8 pb-6 border-b border-[#D4AF37]/20">
          <div>
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Bénéficiaire</p>
            <p className="font-semibold">{companyName}</p>
            <p className="text-[#A1A1AA] text-sm mt-1">{companyAddress}</p>
            <p className="text-[#A1A1AA] text-sm">{companyEmail}</p>
          </div>
          <div>
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Trajet concerné</p>
            <p className="font-semibold text-sm">{booking.client_name}</p>
            <p className="text-[#A1A1AA] text-sm mt-1">{booking.pickup_date} à {booking.pickup_time}</p>
          </div>
        </div>

        {/* Trip details */}
        <div className="pb-6 border-b border-[#D4AF37]/20">
          <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Détail du prélèvement</p>
          <div className="bg-[#141414] rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#A1A1AA]">Trajet</span>
              <span className="text-right max-w-[60%] text-xs">{booking.pickup_address} → {booking.dropoff_address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A1A1AA]">Type de service</span>
              <span className="capitalize">{booking.transfer_type || 'VTC'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A1A1AA]">Chauffeur</span>
              <span>{booking.driver_name || '—'}</span>
            </div>
          </div>
        </div>

        {/* Amounts breakdown */}
        <div className="pb-6 border-b border-[#D4AF37]/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#D4AF37]">
                <th className="text-left py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Calcul</th>
                <th className="text-right py-3 text-[#D4AF37] text-xs uppercase tracking-widest">Montant</th>
              </tr>
            </thead>
            <tbody className="space-y-1">
              <tr className="border-b border-[#D4AF37]/10">
                <td className="py-2 text-[#A1A1AA]">Montant course TTC (client)</td>
                <td className="text-right font-mono">{formatCurrency(booking.price_ttc)}</td>
              </tr>
              <tr className="border-b border-[#D4AF37]/10">
                <td className="py-2 text-[#A1A1AA]">Montant versé chauffeur HT</td>
                <td className="text-right font-mono text-green-400">− {formatCurrency(booking.driver_earning)}</td>
              </tr>
              <tr>
                <td className="py-2 text-[#A1A1AA]">= Commission HT ({commissionRate}%)</td>
                <td className="text-right font-mono">{formatCurrency(booking.commission_ht)}</td>
              </tr>
              <tr>
                <td className="py-2 text-[#A1A1AA]">TVA ({tvaCommRate}%)</td>
                <td className="text-right font-mono">{formatCurrency(booking.tva_commission)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="bg-gradient-to-r from-[#D4AF37]/15 to-[#D4AF37]/5 border-2 border-[#D4AF37] rounded-lg p-5">
          <div className="flex justify-between items-center">
            <span className="text-[#D4AF37] font-bold uppercase tracking-widest">Commission TTC</span>
            <span className="text-[#D4AF37] text-3xl font-bold font-mono">{formatCurrency(booking.commission_ttc)}</span>
          </div>
          <p className="text-[#A1A1AA] text-xs mt-2">
            = Facture Client ({formatCurrency(booking.price_ttc)}) − Facture Chauffeur ({formatCurrency(booking.driver_earning)})
          </p>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#D4AF37]/20 text-xs text-[#A1A1AA] space-y-1">
          <p className="font-semibold text-yellow-400">⚠ Document confidentiel — réservé à l'administration.</p>
          <p>TVA sur commission à reverser au Trésor public.</p>
          <p className="text-center text-[#D4AF37]/60 mt-4">{companyName} © {new Date().getFullYear()} — Usage interne uniquement.</p>
        </div>
      </div>
    </div>
  );
};

export default InvoiceCommissionTemplate;
