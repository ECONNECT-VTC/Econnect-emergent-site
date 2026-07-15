import React from 'react';
import {
  formatDate,
  calculateDueDate,
  formatCurrency,
  formatInvoiceNumber,
  getClientVatRate,
  computeHtFromTtc,
  isDispositionTransfer,
} from '@/utils/invoiceUtils';
import LogoDisplay from '@/components/LogoDisplay';
import { formatPaymentMethodLabel, formatPaymentStatusLabel } from '@/utils/paymentUtils';

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
  const companyPhone = settings?.company_phone || 'À compléter';
  const companyIban = settings?.company_iban || 'À compléter';
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

  // Detect mise à disposition and expose duration in hours
  const isDispositionOrder = isDispositionTransfer(booking.transfer_type);
  const dispositionHours = isDispositionOrder && Number(booking.disposition_hours) > 0
    ? Number(booking.disposition_hours)
    : null;

  const serviceDescription = booking.transfer_type
    ? `Course VTC — ${booking.transfer_type}`
    : 'Course VTC';

  return (
    <div className="bg-white border border-[#D0D0D0] shadow-lg max-w-3xl mx-auto text-[#111111] print:shadow-none print:border-0">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-8 py-5 flex justify-between items-start gap-6 border-b border-[#D0D0D0]">
        {/* Left: logo + company */}
        <div className="flex-1 min-w-0">
          <LogoDisplay className="h-[72px]" priority />
          <p className="text-[#555555] text-xs uppercase tracking-widest mt-2">
            Service de Transport Privé Premium
          </p>
          <p className="text-[#555555] text-xs mt-1">SIRET : <span className="font-mono text-[#111111]">{companySiret}</span></p>
          <p className="text-[#555555] text-xs">N° VTC : <span className="font-mono text-[#111111]">{companyVtc}</span></p>
        </div>

        {/* Right: invoice number + date box */}
        <div className="border border-[#CCCCCC] rounded-md px-6 py-4 text-right min-w-[200px] flex-shrink-0">
          <p className="text-xs uppercase tracking-widest text-[#555555] font-semibold">Facture N°</p>
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

      {/* ── Émetteur / Client ──────────────────────────────────── */}
      <div className="grid grid-cols-2 border-b border-[#D0D0D0]">
        {/* Émetteur */}
        <div className="border-r border-[#D0D0D0]">
          <div className="bg-[#2A2A2A] px-6 py-2">
            <p className="text-white text-xs uppercase tracking-widest font-semibold">Émetteur</p>
          </div>
          <div className="px-6 py-4 space-y-1 text-sm">
            <p className="font-bold text-base">{companyName}</p>
            <p className="text-[#555555]">{companyAddress}</p>
            <p className="text-[#555555]">{companyEmail}</p>
            {companyPhone && companyPhone !== 'À compléter' && (
              <p className="text-[#555555]">{companyPhone}</p>
            )}
          </div>
        </div>

        {/* Client */}
        <div>
          <div className="bg-[#2A2A2A] px-6 py-2">
            <p className="text-white text-xs uppercase tracking-widest font-semibold">Client</p>
          </div>
          <div className="px-6 py-4 space-y-1 text-sm">
            <p className="font-bold text-base">{booking.client_name}</p>
            <p className="text-[#555555]">{booking.client_email}</p>
            {booking.client_phone && (
              <p className="text-[#555555]">{booking.client_phone}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Lines table ────────────────────────────────────────── */}
      <div className="px-8 py-6 border-b border-[#D0D0D0]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#2A2A2A] text-white">
              <th className="text-left px-3 py-2 text-xs uppercase tracking-widest font-semibold rounded-tl">Description</th>
              <th className="text-center px-3 py-2 text-xs uppercase tracking-widest font-semibold">Qté</th>
              <th className="text-right px-3 py-2 text-xs uppercase tracking-widest font-semibold">Prix HT</th>
              <th className="text-right px-3 py-2 text-xs uppercase tracking-widest font-semibold">TVA</th>
              <th className="text-right px-3 py-2 text-xs uppercase tracking-widest font-semibold rounded-tr">Total TTC</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#E0E0E0]">
              <td className="px-3 py-3">
                <p className="font-medium">{serviceDescription}</p>
                <p className="text-[#555555] text-xs mt-1">
                  Départ : {booking.pickup_address || 'N/A'}
                </p>
                <p className="text-[#555555] text-xs">
                  Arrivée : {booking.dropoff_address || 'N/A'}
                </p>
                {booking.pickup_date && (
                  <p className="text-[#555555] text-xs">
                    Le {booking.pickup_date}{booking.pickup_time ? ` à ${booking.pickup_time}` : ''}
                  </p>
                )}
                {dispositionHours !== null && (
                  <p className="text-[#555555] text-xs">
                    Durée : {dispositionHours}h
                  </p>
                )}
              </td>
              <td className="text-center px-3 py-3 font-mono">
                {distanceKm != null ? `${distanceKm.toFixed(2)} km` : '1'}
              </td>
              <td className="text-right px-3 py-3 font-mono">
                {unitPriceHt != null ? formatCurrency(unitPriceHt) : formatCurrency(linePriceHt)}
              </td>
              <td className="text-right px-3 py-3 font-mono">{tvaRate}&nbsp;%</td>
              <td className="text-right px-3 py-3 font-mono font-semibold">{formatCurrency(resolvedPriceTtc)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Penalties notice ───────────────────────────────────── */}
      <div className="px-8 py-3 border-b border-[#D0D0D0]">
        <p className="text-xs text-[#777777]">
          Paiement sous 30 jours. Tout retard entraîne des pénalités égales à 3 fois le taux d'intérêt légal.
        </p>
      </div>

      {/* ── Totals + Payment ───────────────────────────────────── */}
      <div className="px-8 py-6 border-b border-[#D0D0D0] flex flex-col items-end gap-6">
        {/* Totals block */}
        <div className="w-64 text-sm">
          <div className="flex justify-between py-2 border-b border-[#E0E0E0]">
            <span className="text-[#555555]">Total HT</span>
            <span className="font-mono font-semibold">{formatCurrency(resolvedPriceHt)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#E0E0E0]">
            <span className="text-[#555555]">Montant TVA ({tvaRate}&nbsp;%)</span>
            <span className="font-mono font-semibold">{formatCurrency(resolvedTvaAmount)}</span>
          </div>
          <div className="flex justify-between items-center mt-1 px-3 py-3 bg-[#D4AF37] rounded-md">
            <span className="font-bold uppercase tracking-wide text-[#111111] text-xs">Total TTC</span>
            <span className="font-mono font-bold text-[#111111] text-lg">{formatCurrency(resolvedPriceTtc)}</span>
          </div>
        </div>
      </div>

      {/* ── Payment info ───────────────────────────────────────── */}
      <div className="px-8 py-5 border-b border-[#D0D0D0] text-sm space-y-2">
        <p className="text-[#555555] text-xs uppercase tracking-widest font-semibold mb-2">Informations de paiement</p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[#555555]">Mode de paiement :</span>
          <span className="font-medium">{formatPaymentMethodLabel(booking.payment_method || booking.notes)}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[#555555]">Statut :</span>
          <span className="font-bold text-[#D4AF37]">{formatPaymentStatusLabel(booking.payment_status)}</span>
        </div>
        {(String(booking.payment_method || booking.notes || '').toLowerCase().includes('virement') || companyIban !== 'À compléter') && (
          <div className="flex items-center gap-3">
            <span className="font-bold font-mono">IBAN : {companyIban}</span>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="px-8 py-5 text-xs text-[#777777] text-center space-y-1">
        {isDriverIssued && (
          <p className="text-[#333333] font-semibold mb-2">
            Facture éditée par la société Econnect VTC pour la société à laquelle le chauffeur est rattaché.
          </p>
        )}
        <p className="mt-1">
          <span className="font-bold text-[#333333]">{companyName}</span>
          {' '}— SIRET : {companySiret} — N° VTC : {companyVtc}
        </p>
        <p className="mt-1">
          <span className="font-bold text-[#333333]">{companyName}</span>
          {' '}© {new Date().getFullYear()} — Merci de votre confiance.
        </p>
      </div>
    </div>
  );
};

export default InvoiceClientTemplate;
