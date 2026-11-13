import { useRef, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';
import { downloadBillingDocument } from './BillingInvoiceActions';

const money = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const options = { withCredentials: true, timeout: 20000 };

export default function BillingAccountPanel({ role, bookingId, driverId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const checkoutRequests = useRef({});
  const load = async () => {
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      const path = role === 'client'
        ? `/api/billing/bookings/${encodeURIComponent(bookingId)}/invoices`
        : role === 'driver' ? '/api/driver/supplementary-invoices'
          : `/api/admin/financial/supplementary${driverId && driverId !== 'all' ? `?driver_id=${encodeURIComponent(driverId)}` : ''}`;
      const response = await axios.get(`${API_URL}${path}`, options);
      const next = role === 'client' ? { invoices: response.data } : response.data;
      if (!Array.isArray(next?.invoices)) throw new Error('Registre de facturation invalide.');
      checkoutRequests.current = Object.fromEntries(
        next.invoices.filter((invoice) => invoice.checkout_request_id).map((invoice) => [invoice.id, invoice.checkout_request_id]),
      );
      setData(next);
    } catch (err) {
      setData(null);
      setError(parseApiError(err, 'Impossible de charger la facturation complémentaire.'));
    } finally { setBusy(false); }
  };
  const perform = async (action) => {
    setBusy(true);
    setError('');
    try { await action(); } catch (err) {
      setError(parseApiError(err, 'Opération non confirmée ; rechargez le registre avant de continuer.'));
    } finally { setBusy(false); }
  };
  const invoiceUrl = (invoice) => `${API_URL}/api/billing/bookings/${encodeURIComponent(invoice.booking_id)}/invoices/${encodeURIComponent(invoice.id)}`;

  if (!open) return <button type="button" className="my-3 text-sm text-[#D4AF37]" onClick={load}>
    {role === 'driver' ? 'Frais et documents complémentaires' : 'Factures et avoirs complémentaires'}
  </button>;
  return <section aria-label="Registre complémentaire" className="my-4 space-y-3 rounded border border-[#D4AF37]/30 p-4 text-sm">
    <h3 className="font-semibold text-[#D4AF37]">Factures et avoirs complémentaires</h3>
    <p>Les montants complémentaires sont distincts de la facture initiale. Un avoir ne signifie pas qu’un remboursement a déjà été effectué.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {data?.totals && <p>
      {role === 'admin'
        ? `Compléments nets d’avoirs : ${money(data.totals.amount_ttc_cents)} · Encaissements nets : ${money(data.totals.received_cents)} · À encaisser : ${money(data.totals.remaining_cents)} · À rembourser : ${money(data.totals.refundable_cents)} · Commission TTC : ${money(data.totals.commission_cents)} · TVA client : ${money(data.totals.vat_cents)}`
        : `Gain complémentaire net d’avoirs : ${money(data.totals.driver_cents)} · Commission : ${money(data.totals.commission_cents)}`}
    </p>}
    {data?.invoices.length === 0 && <p>Aucune facture complémentaire.</p>}
    {data?.invoices.map((invoice) => <article key={invoice.id} className="space-y-2 border-t border-white/10 pt-3">
      <p>{invoice.is_initial ? 'Facture initiale avec frais' : 'Facture complémentaire'} n° {invoice.invoice_number} · Réservation {invoice.booking_id.slice(0, 6).toUpperCase()}</p>
      <p>Total : {money(invoice.amount_ttc_cents)}
        {role === 'client' && ` · Solde : ${money(invoice.remaining_cents)} · Remboursé : ${money(invoice.refunded_cents || 0)}`}
        {role === 'driver' && ` · Gain : ${money(invoice.credit ? 0 : invoice.driver_cents)}`}</p>
      {invoice.credit && <p>Avoir intégral n° {invoice.credit.invoice_number} · {invoice.credit.reason}</p>}
      <div className="flex flex-wrap gap-3">
        {(role === 'driver'
          ? ['driver', 'commission', ...(invoice.credit?.commission_invoice_number ? ['commission-credit'] : [])]
          : ['invoice', ...(invoice.credit ? ['credit'] : [])]).map((kind) =>
          <button type="button" key={kind} disabled={busy} onClick={() =>
            perform(() => downloadBillingDocument(invoice.booking_id, invoice.id, kind))}>
            PDF {({ invoice: 'facture', credit: 'avoir', driver: 'relevé chauffeur', commission: 'commission', 'commission-credit': 'avoir de commission' })[kind]}
          </button>)}
        {role === 'client' && !invoice.credit && invoice.remaining_cents > 0 && <button type="button" disabled={busy}
          onClick={() => perform(async () => {
            if (!checkoutRequests.current[invoice.id]) {
              checkoutRequests.current[invoice.id] = invoice.checkout_request_id || window.crypto.randomUUID();
            }
            const { data: session } = await axios.post(`${invoiceUrl(invoice)}/checkout`, {
              request_id: checkoutRequests.current[invoice.id],
            }, options);
            const destination = new URL(session.checkout_url);
            if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('Lien de paiement Stripe invalide.');
            window.location.assign(destination.href);
          })}>{invoice.checkout_request_id ? 'Reprendre le paiement Stripe' : 'Payer le solde via Stripe'}</button>}
        {role === 'client' && invoice.checkout_request_id && <button type="button" disabled={busy}
          onClick={() => perform(async () => {
            await axios.post(`${invoiceUrl(invoice)}/sync-payment`, {}, options);
            await load();
          })}>Vérifier le paiement</button>}
      </div>
    </article>)}
    <button type="button" disabled={busy} onClick={load}>{busy ? 'Chargement…' : 'Actualiser le registre'}</button>
    <button type="button" disabled={busy} onClick={() => setOpen(false)}>Fermer le registre</button>
  </section>;
}
