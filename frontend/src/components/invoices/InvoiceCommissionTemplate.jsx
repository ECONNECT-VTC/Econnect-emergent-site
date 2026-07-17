import React from 'react';
import { formatDate, calculateDueDate, formatCurrency, formatInvoiceNumber } from '@/utils/invoiceUtils';

const INVOICE_PLACEHOLDER_VALUES = ['à compléter', 'a compléter', 'a completer', 'n/a', 'na', 'none', 'null'];

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
  const companyPhone = settings?.company_phone || 'À compléter';
  const companyVatNumber = settings?.company_vat_number || settings?.company_tva_number || 'À compléter';
  const commissionRate = Math.round((booking.commission_rate || settings?.commission_rate || 0.1) * 100);
  const tvaCommRate = Math.round((booking.tva_commission_rate || settings?.tva_commission_rate || 0.2) * 100);
  const footerCompanyName = companyName.replace(/\beconnect\b/gi, 'ECONNECT');
  const sanitizeInvoiceValue = (value, fallback = 'N/A') => {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    const normalized = text.toLowerCase();
    if (INVOICE_PLACEHOLDER_VALUES.includes(normalized)) {
      return fallback;
    }
    return text;
  };
  const partnerCompanyName = sanitizeInvoiceValue(
    booking?.document_driver_company || booking?.issuer?.name || booking?.driver_name || companyName
  );
  const partnerCompanyAddress = sanitizeInvoiceValue(
    booking?.document_driver_address || booking?.issuer?.address || companyAddress
  );
  const partnerCompanyEmail = sanitizeInvoiceValue(
    booking?.issuer?.email || booking?.document_driver_email || companyEmail
  );
  const partnerCompanyPhone = sanitizeInvoiceValue(
    booking?.document_driver_phone || booking?.issuer?.phone || companyPhone
  );
  const partnerCompanySiret = sanitizeInvoiceValue(
    booking?.document_driver_siret || booking?.issuer?.siret || companySiret
  );
  const partnerCompanyVat = sanitizeInvoiceValue(
    booking?.document_driver_company_vat_number
      || booking?.document_driver_company_tva_number
      || booking?.issuer?.vat_number
      || booking?.issuer?.company_vat_number
      || booking?.issuer?.company_tva_number
      || companyVatNumber
  );
  const partnerDriverName = sanitizeInvoiceValue(
    booking?.document_driver_name || booking?.issuer?.driver_name || booking?.driver_name
  );

  return (
    <div className="bg-white border border-[#D0D0D0] shadow-lg max-w-3xl mx-auto text-[#111111] print:shadow-none print:border-0">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-8 py-5 flex justify-between items-start gap-6 border-b border-[#D0D0D0]">
        <div className="flex-1 min-w-0">
          <div className="inline-flex bg-[#F3F3F3] rounded-md px-4 py-2">
            <img
              src="/photo/logo-invoice-hd.png"
              alt="Logo ECONNECT VTC"
              className="h-[64px] w-[220px] object-contain"
              loading="eager"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = '/photo/logo-cropped.png';
              }}
            />
          </div>
        </div>

        <div className="border border-[#CCCCCC] rounded-md px-6 py-4 text-right min-w-[220px] flex-shrink-0">
          <p className="text-xs uppercase tracking-widest text-[#555555] font-semibold">Facture commission N°</p>
          <p className="text-2xl font-bold font-mono text-[#111111] mt-1">{invoiceNumber}</p>
          <div className="mt-3 border-t border-[#DDDDDD] pt-2 space-y-1 text-xs text-[#555555]">
            <div className="flex justify-between gap-4">
              <span>Date :</span>
              <span className="font-semibold text-[#111111]">{dateStr}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Échéance :</span>
              <span className="font-semibold text-[#111111]">{dueStr}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sociétés ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-[#D0D0D0]">
        <div className="border-r border-[#D0D0D0]">
          <div className="bg-black/80 px-6 py-2">
            <p className="text-white text-xs uppercase tracking-widest font-semibold">Notre société</p>
          </div>
          <div className="px-6 py-4 space-y-1 text-sm">
            <p className="font-bold text-base">{companyName}</p>
            <p className="text-[#555555]">{companyAddress}</p>
            <p className="text-[#555555]">{companyEmail}</p>
            <p className="text-[#555555]">Tél : {companyPhone}</p>
            <p className="text-[#555555]">SIRET : {companySiret}</p>
            <p className="text-[#555555]">N° TVA : {companyVatNumber}</p>
          </div>
        </div>
        <div>
          <div className="bg-black/80 px-6 py-2">
            <p className="text-white text-xs uppercase tracking-widest font-semibold">Société de rattachement chauffeur</p>
          </div>
          <div className="px-6 py-4 space-y-1 text-sm">
            <p className="font-bold text-base">{partnerCompanyName}</p>
            <p className="text-[#555555]">{partnerCompanyAddress}</p>
            <p className="text-[#555555]">{partnerCompanyEmail}</p>
            <p className="text-[#555555]">Tél : {partnerCompanyPhone}</p>
            <p className="text-[#555555]">SIRET : {partnerCompanySiret}</p>
            <p className="text-[#555555]">N° TVA : {partnerCompanyVat}</p>
            {partnerDriverName !== 'N/A' && (
              <p className="text-[#555555]">Chauffeur : {partnerDriverName}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            ['Date', dateStr],
            ['Taux commission', `${commissionRate}%`],
            ['TVA commission', `${tvaCommRate}%`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[#555555] text-xs uppercase tracking-widest mb-1 font-semibold">{label}</p>
              <p className="text-[#111111] font-semibold text-sm">{value}</p>
            </div>
          ))}
        </div>

        {(clientRef || driverRef) && (
          <div className="bg-[#F7F7F7] rounded-lg px-4 py-3 text-sm space-y-1 border border-[#E5E5E5]">
            {clientRef && (
              <div>
                <span className="text-[#555555]">Réf. facture client : </span>
                <span className="text-[#111111] font-mono font-semibold">{clientRef}</span>
              </div>
            )}
            {driverRef && (
              <div>
                <span className="text-[#555555]">Réf. facture chauffeur : </span>
                <span className="text-[#111111] font-mono font-semibold">{driverRef}</span>
              </div>
            )}
          </div>
        )}

        <div className="border border-[#D0D0D0] rounded-md overflow-hidden">
          <div className="bg-black/80 px-6 py-2">
            <p className="text-white text-xs uppercase tracking-widest font-semibold">Trajet concerné</p>
          </div>
          <div className="px-6 py-4 space-y-1 text-sm">
            <p className="font-medium">Commission de gestion — {booking.transfer_type || 'VTC'}</p>
            <p className="text-[#555555]">Client : {booking.client_name || 'N/A'}</p>
            <p className="text-[#555555]">Départ : {booking.pickup_address || 'N/A'}</p>
            <p className="text-[#555555]">Arrivée : {booking.dropoff_address || 'N/A'}</p>
            <p className="text-[#555555]">
              Le {booking.pickup_date || 'N/A'}{booking.pickup_time ? ` à ${booking.pickup_time}` : ''}
            </p>
          </div>
        </div>

        {/* Amounts breakdown */}
        <div className="pb-6 border-b border-[#D0D0D0]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-black/80 text-white">
                <th className="text-left px-3 py-2 text-xs uppercase tracking-widest font-semibold rounded-tl">Description</th>
                <th className="text-right px-3 py-2 text-xs uppercase tracking-widest font-semibold">Montant HT</th>
                <th className="text-right px-3 py-2 text-xs uppercase tracking-widest font-semibold">TVA</th>
                <th className="text-right px-3 py-2 text-xs uppercase tracking-widest font-semibold rounded-tr">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#E0E0E0]">
                <td className="px-3 py-3">
                  <p className="font-medium">Commission de gestion — {booking.transfer_type || 'VTC'}</p>
                  <p className="text-[#555555] text-xs mt-1">Base client TTC : {formatCurrency(booking.price_ttc)}</p>
                  <p className="text-[#555555] text-xs">Montant reversé chauffeur : {formatCurrency(booking.driver_earning)}</p>
                </td>
                <td className="text-right px-3 py-3 font-mono">{formatCurrency(booking.commission_ht)}</td>
                <td className="text-right px-3 py-3 font-mono">{tvaCommRate}&nbsp;%</td>
                <td className="text-right px-3 py-3 font-mono font-semibold">{formatCurrency(booking.commission_ttc)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="flex flex-col items-end gap-6">
          <div className="w-64 text-sm">
            <div className="flex justify-between py-2 border-b border-[#E0E0E0]">
              <span className="text-[#555555]">Commission HT</span>
              <span className="font-mono font-semibold">{formatCurrency(booking.commission_ht)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E0E0E0]">
              <span className="text-[#555555]">Montant TVA ({tvaCommRate}&nbsp;%)</span>
              <span className="font-mono font-semibold">{formatCurrency(booking.tva_commission)}</span>
            </div>
            <div className="flex justify-between items-center mt-1 px-3 py-3 bg-[#D4AF37] rounded-md">
              <span className="font-bold uppercase tracking-wide text-[#111111] text-xs">Commission TTC</span>
              <span className="font-mono font-bold text-[#111111] text-lg">{formatCurrency(booking.commission_ttc)}</span>
            </div>
          </div>
          <p className="text-[#777777] text-xs">
            = Facture Client ({formatCurrency(booking.price_ttc)}) − Facture Chauffeur ({formatCurrency(booking.driver_earning)})
          </p>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#D0D0D0] text-xs text-[#777777] space-y-1 text-center">
          <p className="font-semibold text-[#333333]">⚠ Document confidentiel — réservé à l'administration.</p>
          <p className="mt-1">
            <span className="font-bold text-[#333333]">{footerCompanyName}</span>
            {' '}- SIRET : {companySiret} - N° TVA : {companyVatNumber}
          </p>
          <p className="mt-1">
            {companyAddress} - Tél : {companyPhone} - {companyEmail} - N° VTC : {companyVtc}
          </p>
        </div>
      </div>
    </div>
  );
};

export default InvoiceCommissionTemplate;
