import React from 'react';
import {
  formatDate,
  formatCurrency,
  formatInvoiceNumber,
  isDispositionTransfer,
} from '@/utils/invoiceUtils';

const PLACEHOLDER_VALUES = ['a completer', 'n/a', 'na', 'none', 'null'];

/**
 * ActivityStatementTemplate
 *
 * Display-only React component for a Relevé d'Activité (driver activity statement).
 * Design matches InvoiceCommissionTemplate (white bg, black section headers, gold accents).
 * Use window.print() to export as PDF.
 *
 * Props:
 *   booking  – completed booking row (from /api/admin/financial/completed-bookings
 *              or /api/driver/invoices)
 *   settings – commission/company settings
 */
const ActivityStatementTemplate = ({ booking, settings }) => {
  if (!booking) return null;

  const activityNumber = booking.activity_invoice_number
    ? formatInvoiceNumber(booking.activity_invoice_number)
    : booking.driver_invoice_number
    ? formatInvoiceNumber(booking.driver_invoice_number)
    : '------';

  const activityDate = booking.created_at ? new Date(booking.created_at) : new Date();
  const dateStr = formatDate(activityDate);

  const companyName = settings?.company_name || 'ECONNECT VTC';
  const companyAddress = settings?.company_address || 'Paris, France';
  const companySiret = settings?.company_siret || 'À compléter';
  const companyVtc = settings?.company_vtc_number || 'À compléter';
  const companyEmail = settings?.company_email || 'contact@econnect-vtc.fr';
  const companyPhone = settings?.company_phone || 'À compléter';
  const companyVatNumber = settings?.company_vat_number || settings?.company_tva_number || 'À compléter';
  const commissionRate = Math.round((booking.commission_rate || settings?.commission_rate || 0.1) * 100);

  const sanitize = (value, fallback = 'N/A') => {
    const text = String(value ?? '').trim();
    if (!text) return fallback;
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (PLACEHOLDER_VALUES.includes(normalized)) return fallback;
    return text;
  };

  const partnerCompanyName = sanitize(
    booking?.document_driver_company || booking?.issuer?.name || booking?.driver_name || companyName
  );
  const partnerCompanyAddress = sanitize(
    booking?.document_driver_address || booking?.issuer?.address || companyAddress
  );
  const partnerCompanyEmail = sanitize(
    booking?.issuer?.email || booking?.document_driver_email || companyEmail
  );
  const partnerCompanyPhone = sanitize(
    booking?.document_driver_phone || booking?.issuer?.phone || companyPhone
  );
  const partnerCompanySiret = sanitize(
    booking?.document_driver_siret || booking?.issuer?.siret || companySiret
  );
  const partnerCompanyVat = sanitize(
    booking?.document_driver_company_vat_number
      || booking?.document_driver_company_tva_number
      || booking?.issuer?.vat_number
      || booking?.issuer?.company_vat_number
      || booking?.issuer?.company_tva_number
      || companyVatNumber
  );
  const partnerDriverName = sanitize(
    booking?.document_driver_name || booking?.issuer?.driver_name || booking?.driver_name
  );

  const serviceLabel = isDispositionTransfer(booking.transfer_type)
    ? 'Mise à disposition VTC'
    : 'Course VTC';

  const periodLabel = booking.pickup_date
    ? `${booking.pickup_date}${booking.pickup_time ? ` à ${booking.pickup_time}` : ''}`
    : dateStr;

  const clientInvoiceRef = booking.client_invoice_number
    ? formatInvoiceNumber(booking.client_invoice_number)
    : null;

  const driverInvoiceRef = booking.driver_invoice_number
    ? formatInvoiceNumber(booking.driver_invoice_number)
    : null;

  const priceTtc = Number(booking.price_ttc || 0);
  const commissionTtc = Number(booking.commission_ttc || 0);
  const driverEarning = Number(booking.driver_earning || 0);

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

        <div className="border border-[#D4AF37] rounded-md px-6 py-4 text-right min-w-[220px] flex-shrink-0">
          <p className="text-xs uppercase tracking-widest text-[#555555] font-semibold">Relevé d'activité N°</p>
          <p className="text-2xl font-bold font-mono text-[#111111] mt-1">{activityNumber}</p>
          <div className="mt-3 border-t border-[#DDDDDD] pt-2 space-y-1 text-xs text-[#555555]">
            <div className="flex justify-between gap-4">
              <span>Date :</span>
              <span className="font-semibold text-[#111111]">{dateStr}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Période :</span>
              <span className="font-semibold text-[#111111]">{periodLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sociétés ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-[#D0D0D0]">
        <div className="border-r border-[#D0D0D0]">
          <div className="bg-black/80 px-6 py-2">
            <p className="text-white text-xs uppercase tracking-widest font-semibold">SOCIETE EMETTRICE</p>
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
            <p className="text-white text-xs uppercase tracking-widest font-semibold">SOCIETE PARTENAIRE</p>
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
        {/* ── Gradient separator ───────────────────────────────── */}
        <div className="h-px bg-gradient-to-r from-transparent via-[#D4AF37]/40 to-transparent" />

        {/* ── Metadata grid ────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 bg-[#FAF7EF] rounded-md px-4 py-3 border border-[#D4AF37]/20">
          {[
            ['Date', dateStr],
            ['Taux commission', `${commissionRate}%`],
            ['Service', serviceLabel],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[#D4AF37] text-[10px] uppercase tracking-widest mb-1 font-semibold">{label}</p>
              <p className="text-[#111111] font-bold text-sm">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Invoice references ───────────────────────────────── */}
        {(clientInvoiceRef || driverInvoiceRef) && (
          <div className="bg-[#F7F7F7] rounded-lg px-4 py-3 text-sm space-y-1 border border-[#E5E5E5]">
            {clientInvoiceRef && (
              <div>
                <span className="text-[#555555]">Réf. facture client : </span>
                <span className="text-[#111111] font-mono font-semibold">{clientInvoiceRef}</span>
              </div>
            )}
            {driverInvoiceRef && (
              <div>
                <span className="text-[#555555]">Réf. facture chauffeur : </span>
                <span className="text-[#111111] font-mono font-semibold">{driverInvoiceRef}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Activity table ───────────────────────────────────── */}
        <div className="pb-6 border-b border-[#D0D0D0]">
          <table className="w-full text-sm border-collapse table-fixed">
            <thead>
              <tr className="bg-black/80 text-white">
                <th className="text-left px-3 py-2 text-xs uppercase tracking-widest font-semibold rounded-tl w-[22%]">Date</th>
                <th className="text-left px-3 py-2 text-xs uppercase tracking-widest font-semibold w-[26%]">Service / Réf.</th>
                <th className="text-center px-3 py-2 text-xs uppercase tracking-widest font-semibold w-[18%]">Course TTC</th>
                <th className="text-center px-3 py-2 text-xs uppercase tracking-widest font-semibold w-[16%]">Commission TTC</th>
                <th className="text-center px-3 py-2 text-xs uppercase tracking-widest font-semibold rounded-tr w-[18%]">Versé HT</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#E0E0E0]">
                <td className="px-3 py-3 text-xs text-[#555555]">
                  {booking.pickup_date || 'N/A'}
                  {booking.pickup_time ? <><br />{booking.pickup_time}</> : null}
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium">{serviceLabel}</p>
                  <p className="text-[#555555] text-xs mt-0.5">{activityNumber}</p>
                </td>
                <td className="text-center px-3 py-3 font-mono tabular-nums">{formatCurrency(priceTtc)}</td>
                <td className="text-center px-3 py-3 font-mono tabular-nums">
                  − {formatCurrency(commissionTtc)}
                </td>
                <td className="text-center px-3 py-3 font-mono tabular-nums font-semibold">{formatCurrency(driverEarning)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Totals ───────────────────────────────────────────── */}
        <div className="flex flex-col items-end gap-6">
          <div className="w-64 text-sm">
            <div className="flex justify-between py-2 border-b border-[#E0E0E0]">
              <span className="text-[#555555]">Montant course TTC</span>
              <span className="font-mono font-semibold">{formatCurrency(priceTtc)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E0E0E0]">
              <span className="text-[#555555]">Commission prélevée TTC ({commissionRate}&nbsp;%)</span>
              <span className="font-mono font-semibold">− {formatCurrency(commissionTtc)}</span>
            </div>
            <div className="flex justify-between items-center mt-1 px-3 py-3 bg-[#D4AF37] rounded-md">
              <span className="font-bold uppercase tracking-wide text-[#111111] text-xs">Total activité HT</span>
              <span className="font-mono font-bold text-[#111111] text-lg">{formatCurrency(driverEarning)}</span>
            </div>
          </div>
        </div>

        {/* ── Gradient separator ───────────────────────────────── */}
        <div className="h-px bg-gradient-to-r from-transparent via-[#D4AF37]/40 to-transparent" />

        {/* ── Pre-footer mention ───────────────────────────────── */}
        <p className="text-center text-xs italic text-[#888888]">
          Relevé d'activité généré automatiquement — À conserver pour vos archives.
        </p>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="pt-4 border-t border-[#D0D0D0] text-xs text-[#777777] space-y-1 text-center">
          <p className="mt-1">
            <span className="font-bold text-[#333333]">{companyName}</span>
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

export default ActivityStatementTemplate;
