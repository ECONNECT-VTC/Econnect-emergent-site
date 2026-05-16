import React from 'react';
import { formatDate, calculateDueDate, formatCurrency, formatInvoiceNumber } from '@/utils/invoiceUtils';
import LogoDisplay from '@/components/LogoDisplay';

/**
 * InvoiceDriverTemplate
 *
 * Display-only React component for a Facture Chauffeur.
 * Shows the amount owed to the driver (net after commission).
 *
 * Props:
 *   booking  – completed booking row (from /api/admin/financial/completed-bookings
 *              or /api/driver/invoices)
 *   settings – commission/company settings (optional; defaults used if absent)
 *   clientInvoiceNumber – reference to the associated client invoice number
 */
const InvoiceDriverTemplate = ({ booking, settings, clientInvoiceNumber }) => {
  if (!booking) return null;

  const invoiceNumber = booking.driver_invoice_number
    ? formatInvoiceNumber(booking.driver_invoice_number)
    : booking.invoice_number
    ? formatInvoiceNumber(booking.invoice_number)
    : '------';

  const clientRef = clientInvoiceNumber
    ? formatInvoiceNumber(clientInvoiceNumber)
    : booking.client_invoice_number
    ? formatInvoiceNumber(booking.client_invoice_number)
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
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold">Facture Chauffeur</p>
            <p className="text-2xl font-bold text-[#D4AF37] font-mono mt-1">{invoiceNumber}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-[#A1A1AA]">
          <span>SIRET : <span className="text-[#FAFAFA] font-mono">{companySiret}</span></span>
          <span>N° VTC : <span className="text-[#FAFAFA] font-mono">{companyVtc}</span></span>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Dates + client invoice reference */}
        <div className="grid grid-cols-3 gap-4">
          {[
            ['Date', dateStr],
            ['Conditions', '30 jours'],
            ["Échéance", dueStr],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-1">{label}</p>
              <p className="text-[#FAFAFA] font-semibold text-sm">{value}</p>
            </div>
          ))}
        </div>
        {clientRef && (
          <div className="bg-[#141414] rounded-lg px-4 py-3 text-sm">
            <span className="text-[#A1A1AA]">Référence facture client : </span>
            <span className="text-[#D4AF37] font-mono font-semibold">{clientRef}</span>
          </div>
        )}

        {/* Parties */}
        <div className="grid grid-cols-2 gap-8 pb-6 border-b border-[#D4AF37]/20">
          <div>
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Émetteur</p>
            <p className="font-semibold">{companyName}</p>
            <p className="text-[#A1A1AA] text-sm mt-1">{companyAddress}</p>
            <p className="text-[#A1A1AA] text-sm">{companyEmail}</p>
          </div>
          <div>
            <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Destinataire (Chauffeur)</p>
            <p className="font-semibold">{booking.driver_name || 'Chauffeur VTC'}</p>
            <p className="text-[#A1A1AA] text-sm mt-1">Chauffeur Partenaire</p>
          </div>
        </div>

        {/* Trip details */}
        <div className="pb-6 border-b border-[#D4AF37]/20">
          <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Détails du trajet attribué</p>
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

        {/* Financial breakdown */}
        <div className="pb-6 border-b border-[#D4AF37]/20 space-y-2 text-sm">
          <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-semibold mb-3">Décompte financier</p>
          <div className="flex justify-between">
            <span className="text-[#A1A1AA]">Montant course TTC</span>
            <span className="font-mono">{formatCurrency(booking.price_ttc)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#A1A1AA]">Commission prélevée TTC ({commissionRate}%)</span>
            <span className="font-mono text-red-400">− {formatCurrency(booking.commission_ttc)}</span>
          </div>
        </div>

        {/* Total */}
        <div className="bg-gradient-to-r from-green-500/10 to-green-500/5 border-2 border-green-500/50 rounded-lg p-5">
          <div className="flex justify-between items-center">
            <span className="text-green-400 font-bold uppercase tracking-widest">Montant à verser (HT)</span>
            <span className="text-green-400 text-3xl font-bold font-mono">{formatCurrency(booking.driver_earning)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#D4AF37]/20 text-xs text-[#A1A1AA] space-y-1">
          <p>Paiement effectué par virement bancaire sous 30 jours.</p>
          <p className="text-center text-[#D4AF37]/60 mt-4">{companyName} © {new Date().getFullYear()} — Merci de votre partenariat.</p>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDriverTemplate;
