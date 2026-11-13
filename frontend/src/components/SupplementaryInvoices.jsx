import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';
import BillingInvoiceActions from './BillingInvoiceActions';

const money = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const options = { withCredentials: true, timeout: 15000 };
const inputClass = 'w-full rounded border border-white/20 bg-[#1E1E1E] p-2 text-white';

export default function SupplementaryInvoices({ bookingId, revision, hasLines, dirty, onChanged, onBusyChange }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [destination, setDestination] = useState('supplementary');
  const initial = destination !== 'supplementary';
  const [paymentInvoice, setPaymentInvoice] = useState('');
  const [amount, setAmount] = useState('');
  const pendingIssue = useRef(null);
  const pendingPayment = useRef(null);
  const pendingInitial = useRef(false);
  const url = `${API_URL}/api/admin/bookings/${encodeURIComponent(bookingId)}/supplementary-invoices`;

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [invoices, capabilities] = await Promise.all([
        axios.get(url, options),
        axios.get(`${API_URL}/api/admin/billing-capabilities`, options),
      ]);
      if (!Number.isInteger(invoices.data?.revision) || !Array.isArray(invoices.data?.invoices)
          || typeof capabilities.data?.issuance_available !== 'boolean') {
        throw new Error('Réponse de facturation invalide.');
      }
      setData({ ...invoices.data, capabilities: capabilities.data });
    } catch (err) {
      setData(null);
      setError(parseApiError(err, 'Impossible de charger les factures complémentaires.'));
    } finally { setBusy(false); }
  }, [url]);

  useEffect(() => { load(); }, [load, revision]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const issue = async (event) => {
    event.preventDefault();
    if (!pendingIssue.current && !window.confirm(
      initial
        ? 'Émettre définitivement la première facture avec les lignes choisies ? Aucun paiement ni courriel automatique ne sera déclenché.'
        : 'Émettre définitivement ces frais sur une facture complémentaire ? La facture initiale ne sera pas modifiée. Aucun paiement ni courriel automatique ne sera déclenché.'
    )) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!pendingIssue.current) {
        pendingInitial.current = initial;
        pendingIssue.current = {
          revision: data.revision, request_id: window.crypto.randomUUID(),
          due_date: dueDate, client: { name: name.trim(), address: address.trim() },
          ...(destination === 'fees_only' ? { include_transport: false, operator_only: true } : {}),
        };
      }
      const target = pendingInitial.current
        ? `${API_URL}/api/admin/bookings/${encodeURIComponent(bookingId)}/initial-invoice-with-charges` : url;
      const response = await axios.post(target, pendingIssue.current, options);
      pendingIssue.current = null;
      setNotice(`Facture ${pendingInitial.current ? 'initiale' : 'complémentaire'} n° ${response.data.invoice_number} émise et archivée. Aucun courriel envoyé.`);
      await load();
      await onChanged();
    } catch (err) {
      setError(`${parseApiError(err, 'Émission non confirmée.')} Réessayez la même demande ou rechargez pour vérifier le registre.`);
    } finally { setBusy(false); }
  };

  const recordPayment = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!pendingPayment.current) {
        if (!/^\d+(?:[.,]\d{1,2})?$/.test(amount)) throw new Error('Saisissez un montant en euros avec deux décimales au maximum.');
        const [euros, cents = ''] = amount.replace(',', '.').split('.');
        const amountCents = Number(euros) * 100 + Number(cents.padEnd(2, '0'));
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Montant reçu invalide.');
        pendingPayment.current = {
          invoiceId: paymentInvoice,
          payload: { revision: data.revision, request_id: window.crypto.randomUUID(), amount_cents: amountCents },
        };
      }
      const pending = pendingPayment.current;
      await axios.post(`${url}/${encodeURIComponent(pending.invoiceId)}/payments`, pending.payload, options);
      pendingPayment.current = null;
      setAmount('');
      setNotice('Encaissement enregistré sur la facture complémentaire uniquement. Aucun débit bancaire déclenché.');
      await load();
      await onChanged();
    } catch (err) {
      setError(`${parseApiError(err, 'Encaissement non confirmé.')} Réessayez la même demande ou rechargez pour vérifier le registre.`);
    } finally { setBusy(false); }
  };

  const download = async (invoice) => {
    setBusy(true);
    setError('');
    try {
      const response = await axios.get(`${url}/${encodeURIComponent(invoice.id)}/pdf`, { ...options, responseType: 'blob' });
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `facture-complementaire-${invoice.invoice_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setError(parseApiError(err, 'Impossible de télécharger le PDF archivé.'));
    } finally { setBusy(false); }
  };

  const synchronized = data?.revision === revision && !dirty;
  const canIssue = synchronized && hasLines && data?.capabilities.issuance_available;
  const pending = pendingIssue.current || pendingPayment.current;

  return <section aria-label="Factures complémentaires" className="space-y-3 border-t border-white/20 pt-4">
    <h3 className="font-semibold text-[#D4AF37]">Factures complémentaires</h3>
    <p className="text-sm text-amber-200">Activation et configuration de production à valider avant utilisation réelle. Les factures émises sont figées ; une correction exige un avoir.</p>
    {data && !data.capabilities.issuance_available && <p role="status">{data.capabilities.reason}</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {notice && <p role="status" className="text-green-300">{notice}</p>}
    {busy && <p role="status">Chargement…</p>}
    {data && !synchronized && <p>Enregistrez puis rechargez le brouillon avant toute opération de facturation.</p>}
    {data?.invoices.map((invoice) => <article key={invoice.id} className="space-y-1 rounded border border-white/20 p-3 text-sm">
      <p>Facture n° {invoice.invoice_number} — facture initiale n° {invoice.original_invoice_number}</p>
      <p>Total : {money(invoice.amount_ttc_cents)} · Reçu : {money(invoice.paid_cents)} · Remboursé : {money(invoice.refunded_cents || 0)} · Solde : {money(invoice.credit ? 0 : invoice.amount_ttc_cents - invoice.paid_cents)}</p>
      <p>Commission : {money(invoice.commission_cents)} · Part chauffeur : {money(invoice.driver_cents)} · Part Econnect : {money(invoice.admin_retained_cents)}</p>
      {(invoice.payments || []).map((payment) => <p key={payment.request_id}>
        Encaissement {payment.recorded_by === 'stripe' ? 'Stripe' : 'manuel'} : {money(payment.amount_cents)} · Référence {payment.request_id}
      </p>)}
      <button type="button" disabled={busy} onClick={() => download(invoice)}>Télécharger le PDF archivé</button>
      <BillingInvoiceActions bookingId={bookingId} invoice={invoice} revision={data.revision}
        disabled={busy || dirty} onChanged={async () => { await load(); await onChanged(); }} />
    </article>)}
    {data?.capabilities.issuance_available && <form onSubmit={issue} className="space-y-3">
      <fieldset disabled={busy || !canIssue || Boolean(pending)} className="space-y-2">
        <legend>Émission distincte de la facture initiale</legend>
        <label className="block text-sm">Destination des frais
          <select className={inputClass} value={destination} onChange={(event) => setDestination(event.target.value)}>
            <option value="supplementary">Facture complémentaire — facture initiale déjà émise</option>
            <option value="initial">Inclure dans la première facture — course terminée</option>
            <option value="fees_only">Première facture de frais Econnect seuls — sans facturer de transport</option>
          </select>
        </label>
        {destination === 'fees_only' && <p>Facturation au nom d’Econnect : seuls les frais explicitement saisis sont facturés, sans part chauffeur. Vérifiez le fondement de chaque ligne et sa TVA.</p>}
        <label className="block text-sm">Nom de facturation du client
          <input required maxLength={160} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm">Adresse de facturation du client
          <input required maxLength={600} className={inputClass} value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="block text-sm">Échéance
          <input required type="date" className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
      </fieldset>
      <button type="submit" disabled={busy || !canIssue || Boolean(pendingPayment.current)}>
        {pendingIssue.current ? 'Réessayer la même émission' : initial ? 'Émettre la facture initiale avec les frais' : 'Émettre la facture complémentaire'}
      </button>
    </form>}
    {data?.invoices.some((invoice) => !invoice.credit && !invoice.active_operation && invoice.paid_cents < invoice.amount_ttc_cents) && <form onSubmit={recordPayment} className="space-y-3">
      <p className="text-sm">Enregistrez uniquement un encaissement déjà reçu. Cette action ne débite pas le client.</p>
      <fieldset disabled={busy || !synchronized || Boolean(pending)} className="space-y-2">
        <legend>Encaissement complémentaire</legend>
        <label className="block text-sm">Facture à encaisser
          <select required className={inputClass} value={paymentInvoice} onChange={(event) => setPaymentInvoice(event.target.value)}>
            <option value="">Choisir une facture</option>
            {data.invoices.filter((invoice) => !invoice.credit && !invoice.active_operation && invoice.paid_cents < invoice.amount_ttc_cents).map((invoice) =>
              <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} — {money(invoice.amount_ttc_cents - invoice.paid_cents)}</option>)}
          </select>
        </label>
        <label className="block text-sm">Montant déjà reçu (€)
          <input required inputMode="decimal" className={inputClass} value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
      </fieldset>
      <button type="submit" disabled={busy || !synchronized || Boolean(pendingIssue.current)}>
        {pendingPayment.current ? 'Réessayer le même encaissement' : 'Enregistrer cet encaissement'}
      </button>
    </form>}
    <button type="button" disabled={busy} onClick={() => {
      pendingIssue.current = null;
      pendingPayment.current = null;
      setNotice('');
      load();
    }}>Recharger les factures complémentaires</button>
  </section>;
}
