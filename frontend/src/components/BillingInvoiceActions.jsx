import { useRef, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';

const options = { withCredentials: true, timeout: 20000 };

export async function downloadBillingDocument(bookingId, invoiceId, kind) {
  const { data } = await axios.get(
    `${API_URL}/api/billing/bookings/${encodeURIComponent(bookingId)}/invoices/${encodeURIComponent(invoiceId)}/documents/${kind}`,
    { ...options, responseType: 'blob' },
  );
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${kind}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BillingInvoiceActions({ bookingId, invoice, revision, disabled, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [sessionId, setSessionId] = useState('');
  const requests = useRef({});
  const url = `${API_URL}/api/admin/bookings/${encodeURIComponent(bookingId)}/supplementary-invoices/${encodeURIComponent(invoice.id)}`;
  const run = async (action) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await onChanged();
      setNotice('Opération terminée ; consultez le registre actualisé.');
    } catch (err) {
      setError(parseApiError(err, 'Opération non confirmée ; rechargez puis reprenez la même demande.'));
    } finally { setBusy(false); }
  };
  const request = (key) => {
    if (!requests.current[key]) requests.current[key] = window.crypto.randomUUID();
    return requests.current[key];
  };
  const blocked = busy || disabled;
  const emailStatus = (kind) => invoice[kind === 'invoice' ? 'email' : 'credit_email']?.status;
  const uncertain = ['invoice', ...(invoice.credit ? ['credit'] : [])].filter((kind) =>
    ['unknown', 'sending'].includes(emailStatus(kind)));

  return <div className="space-y-2 border-t border-white/10 pt-2">
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="flex flex-wrap gap-3">
      {[
        ...(invoice.commission_invoice_number ? ['driver', 'commission'] : []),
        ...(invoice.credit ? ['credit'] : []),
        ...(invoice.credit?.commission_invoice_number ? ['commission-credit'] : []),
      ].map((kind) => <button key={kind} type="button" disabled={blocked}
        onClick={() => run(() => downloadBillingDocument(bookingId, invoice.id, kind))}>
        PDF {({ driver: 'relevé chauffeur', commission: 'commission', credit: 'avoir', 'commission-credit': 'avoir de commission' })[kind]}
      </button>)}
      {['invoice', ...(invoice.credit ? ['credit'] : [])].map((kind) => <button key={kind} type="button"
        disabled={blocked || ['sent', 'sending', 'unknown'].includes(emailStatus(kind))}
        onClick={() => {
          if (window.confirm('Envoyer ce document au client par Brevo ?')) run(() => axios.post(`${url}/email/${kind}`, {}, options));
        }}>
        Envoyer {kind === 'invoice' ? 'la facture' : 'l’avoir'} · {emailStatus(kind) || 'non envoyé'}
      </button>)}
      {invoice.active_operation?.kind === 'checkout' && <button type="button" disabled={blocked}
        onClick={() => run(() => axios.post(
          `${API_URL}/api/billing/bookings/${encodeURIComponent(bookingId)}/invoices/${encodeURIComponent(invoice.id)}/sync-payment`, {}, options,
        ))}>Vérifier le paiement Stripe</button>}
    </div>
    {!invoice.credit && <form onSubmit={(event) => {
      event.preventDefault();
      if (!window.confirm('Émettre un avoir intégral et annuler les montants comptables de cette facture ? Aucun remboursement ne sera déclenché.')) return;
      run(() => {
        if (!requests.current.creditPayload) requests.current.creditPayload = {
          revision, request_id: request('credit'), reason: reason.trim(),
        };
        return axios.post(`${url}/credit`, requests.current.creditPayload, options);
      });
    }} className="space-y-2">
      <label className="block">Motif de l’avoir intégral
        <input required maxLength={600} value={reason} disabled={blocked || Boolean(invoice.active_operation) || Boolean(requests.current.creditPayload)}
          onChange={(event) => setReason(event.target.value)} className="w-full rounded bg-[#1E1E1E] p-2" />
      </label>
      <button disabled={blocked || Boolean(invoice.active_operation)} type="submit">Émettre un avoir intégral</button>
    </form>}
    {invoice.credit && <div>
      <p>Avoir n° {invoice.credit.invoice_number} · {invoice.credit.reason}</p>
      <p>Un avoir ne rembourse pas automatiquement un encaissement.</p>
      {(invoice.payments || []).filter((payment) => !(invoice.refunds || []).some((refund) => refund.payment_id === payment.request_id)).map((payment) =>
        <button type="button" key={payment.request_id} disabled={blocked}
          onClick={() => {
            const stripe = Boolean(payment.payment_intent);
            if (!window.confirm(stripe
              ? `Déclencher le remboursement Stripe de ${(payment.amount_cents / 100).toFixed(2)} € ?`
              : `Confirmer que ${(payment.amount_cents / 100).toFixed(2)} € ont déjà été remboursés hors Stripe ? Aucun virement ne sera déclenché.`)) return;
            const key = `refund-${payment.request_id}`;
            if ((invoice.failed_refunds || []).some((refund) => refund.request_id === requests.current[key])) {
              delete requests.current[key];
            }
            run(() => axios.post(`${url}/refund/${encodeURIComponent(payment.request_id)}`, {
              request_id: invoice.active_operation?.kind === 'refund'
                ? invoice.active_operation.request_id : request(key),
            }, options));
          }}>
          {payment.payment_intent ? 'Rembourser via Stripe' : 'Enregistrer le remboursement déjà effectué'} · {(payment.amount_cents / 100).toFixed(2)} €
        </button>)}
    </div>}
    {invoice.active_operation?.kind === 'checkout' && !invoice.active_operation.session_id && <div>
      <label>Session retrouvée dans Stripe (cs_…)
        <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="w-full rounded bg-[#1E1E1E] p-2" />
      </label>
      <button type="button" disabled={blocked || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)}
        onClick={() => run(() => axios.post(`${url}/resolve-checkout`, { session_id: sessionId }, options))}>
        Vérifier et rattacher cette session Stripe
      </button>
    </div>}
    {uncertain.length > 0 && <div className="space-y-2">
      <p>Envoi incertain : vérifiez l’historique Brevo avant de confirmer l’état. Aucun renvoi automatique.</p>
      <label>Référence ou résultat de vérification Brevo
        <input minLength={5} maxLength={600} value={evidence} onChange={(event) => setEvidence(event.target.value)}
          className="w-full rounded bg-[#1E1E1E] p-2" />
      </label>
      {uncertain.map((kind) => <div key={kind}>
        {[true, false].map((sent) => <button key={String(sent)} type="button" disabled={blocked || evidence.trim().length < 5}
          onClick={() => {
            if (!window.confirm('Confirmer cet état après vérification auprès de Brevo ?')) return;
            run(() => axios.post(`${url}/email/${kind}/resolve`, { sent, evidence: evidence.trim() }, options));
          }}>{kind} : {sent ? 'confirmer envoyé' : 'confirmer non envoyé et autoriser une nouvelle tentative'}</button>)}
      </div>)}
    </div>}
  </div>;
}
