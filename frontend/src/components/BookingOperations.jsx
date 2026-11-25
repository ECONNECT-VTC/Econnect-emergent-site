import { useEffect, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function WaitingTimer({ waiting }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!waiting || waiting.ended_at) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  if (!waiting) return null;
  const elapsed = Math.max(0, ((waiting.ended_at ? Date.parse(waiting.ended_at) : now) - Date.parse(waiting.started_at)) / 1000);
  const remaining = Math.max(0, waiting.rules.free_minutes * 60 - Math.floor(elapsed));
  const format = (seconds) => `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
  const billable = Math.ceil(Math.max(0, elapsed - waiting.rules.free_minutes * 60) / 60);
  return <div className="my-3 rounded border border-amber-400/40 p-3 text-sm" role="timer" aria-label="Temps d’attente">
    <p>{waiting.ended_at ? 'Attente terminée' : 'Chauffeur arrivé · En attente'} : {format(Math.floor(elapsed))}</p>
    {waiting.rules.enabled ? <>
      <p>Franchise restante : {format(remaining)}</p>
      <p>Estimation : {(billable * Number(waiting.rules.price_per_minute)).toFixed(2)} € · {billable} min entamée(s) au-delà de la franchise.</p>
    </> : <p>Aucun barème d’attente activé au début de cette attente.</p>}
    <p>Tout frais reste soumis à validation de l’administration, sans facturation automatique.</p>
  </div>;
}

export function ArriveButton({ booking, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (booking.status !== 'ASSIGNED' || booking.waiting) return null;
  const arrive = async () => {
    setBusy(true); setError('');
    try {
      await axios.post(`${API_URL}/api/bookings/${booking.id}/arrive`, {}, { withCredentials: true });
      await onChanged();
    } catch (err) {
      setError(parseApiError(err, 'Impossible de signaler l’arrivée.'));
    } finally { setBusy(false); }
  };
  return <div className="my-3">
    <Button type="button" disabled={busy} onClick={arrive}>Arrivé / En attente</Button>
    {error && <p role="alert" className="text-red-400">{error}</p>}
  </div>;
}

export function RouteChangeNotice({ change }) {
  if (!change) return null;
  return <div className="my-3 rounded border border-amber-400/40 p-3 text-sm">
    <p>Trajet modifié le {new Date(change.changed_at).toLocaleString('fr-FR')}. Les adresses sont actualisées.</p>
    <p>Ancien trajet : {change.previous_route.pickup_address} → {change.previous_route.dropoff_address}.</p>
    <p>Prix initial conservé : {Number(change.initial_price).toFixed(2)} €.</p>
    <p>Tarif indicatif du trajet : {Number(change.suggested_total).toFixed(2)} €.</p>
    <p>{!change.review ? 'Supplément éventuel en attente de validation admin. Le prix initial et le gain chauffeur restent inchangés.'
      : change.review.decision === 'approve' ? 'Supplément validé et préparé en brouillon. Son émission reste à effectuer par l’administration.'
        : 'Aucun supplément retenu. Le prix initial reste inchangé.'}</p>
  </div>;
}

function OperationReview({ booking, operation, label, suggestion, onChanged }) {
  const [amount, setAmount] = useState(String(suggestion ?? ''));
  const [vat, setVat] = useState('');
  const [taxTreatment, setTaxTreatment] = useState('vat');
  const [taxReason, setTaxReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [billingName, setBillingName] = useState(booking.client_name || '');
  const [billingAddress, setBillingAddress] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  });
  const [issueAndSend, setIssueAndSend] = useState(false);
  let reviewApproved = false;
  const review = async (decision) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const reviewResponse = await axios.post(`${API_URL}/api/admin/bookings/${booking.id}/operations/${operation.id}/review`, {
        decision,
        ...(decision === 'approve' ? { line: {
          description: label, quantity: '1', unit_price_ttc: amount,
          tax_treatment: taxTreatment, vat_percent: taxTreatment === 'vat' ? vat : null,
          tax_reason: taxReason.trim() || null,
        } } : {}),
      }, { withCredentials: true });
      reviewApproved = decision === 'approve';
      if (decision === 'approve' && issueAndSend && label === 'Attente du chauffeur') {
        if (!billingName.trim() || !billingAddress.trim() || !dueDate) {
          throw new Error('Renseignez le nom, l’adresse de facturation et l’échéance.');
        }
        const requestPayload = {
          revision: reviewResponse.data.draft_revision,
          request_id: window.crypto?.randomUUID?.()
            || `waiting-${operation.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          due_date: dueDate,
          client: { name: billingName.trim(), address: billingAddress.trim() },
        };
        const target = booking.has_issued_invoice
          ? `/api/admin/bookings/${booking.id}/supplementary-invoices`
          : `/api/admin/bookings/${booking.id}/initial-invoice-with-charges`;
        const issued = await axios.post(`${API_URL}${target}`, requestPayload, { withCredentials: true });
        await axios.post(
          `${API_URL}/api/admin/bookings/${booking.id}/supplementary-invoices/${issued.data.id}/email/invoice`,
          {}, { withCredentials: true },
        );
        setNotice(`Frais d’attente validés et facture n° ${issued.data.invoice_number} envoyée au client. La part chauffeur est intégrée au registre.`);
      } else if (decision === 'approve') {
        setNotice('Frais validés. Ouvrez « Préparer des frais » pour les émettre et les envoyer.');
      }
      await onChanged();
    } catch (err) {
      if (reviewApproved) await onChanged();
      setError(parseApiError(err, 'Validation enregistrée mais facturation non confirmée. Ouvrez « Préparer des frais » pour terminer.'));
    }
    finally { setBusy(false); }
  };
  if (operation.review) return <p className="my-2 text-sm">{label} : {operation.review.decision === 'approve' ? 'validé' : 'refusé'}.</p>;
  return <form className="my-3 space-y-3 rounded border border-[#D4AF37]/40 p-3" onSubmit={(event) => { event.preventDefault(); review('approve'); }}>
    <h3>{label} · Validation admin</h3>
    <p className="text-sm">Prix initial conservé. Validez un supplément rentable et son taux de TVA. Aucun encaissement automatique.</p>
    <label className="block text-sm">Supplément TTC (€)
      <Input type="number" min="0.01" max="1000000" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} />
    </label>
    <label className="block text-sm">Traitement de TVA
      <select className="w-full rounded border border-white/20 bg-[#1E1E1E] p-2" value={taxTreatment} onChange={(event) => setTaxTreatment(event.target.value)}>
        <option value="vat">TVA applicable</option><option value="exempt">Exonéré</option><option value="outside_scope">Hors champ TVA</option>
      </select>
    </label>
    {taxTreatment === 'vat' && <label className="block text-sm">TVA applicable (%)
      <Input type="number" min="0" max="100" step="0.01" required value={vat} onChange={(event) => setVat(event.target.value)} />
    </label>}
    <label className="block text-sm">Motif de TVA
      <Input required={taxTreatment !== 'vat' || (vat !== '' && Number(vat) === 0)} maxLength={300} value={taxReason} onChange={(event) => setTaxReason(event.target.value)} />
    </label>
    {label === 'Attente du chauffeur' && <>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={issueAndSend} onChange={(event) => setIssueAndSend(event.target.checked)} />
        Émettre immédiatement la facture contenant ce frais et l’envoyer au client
      </label>
      {issueAndSend && <>
        <label className="block text-sm">Nom de facturation
          <Input required maxLength={160} value={billingName} onChange={(event) => setBillingName(event.target.value)} />
        </label>
        <label className="block text-sm">Adresse de facturation du client
          <Input required maxLength={600} value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} />
        </label>
        <label className="block text-sm">Échéance
          <Input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
      </>}
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>{issueAndSend ? 'Valider, facturer et envoyer' : 'Valider et préparer le supplément'}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => review('reject')}>Conserver le prix initial sans supplément</Button>
    </div>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {notice && <p role="status" className="rounded bg-green-500/10 p-2 text-green-200">{notice}</p>}
  </form>;
}

export function AdminOperationReviews({ booking, onChanged }) {
  const waiting = booking.waiting;
  const elapsed = waiting?.ended_at ? Math.max(0, (Date.parse(waiting.ended_at) - Date.parse(waiting.started_at)) / 1000) : 0;
  const suggestion = waiting?.rules.enabled ? (Math.ceil(Math.max(0, elapsed - waiting.rules.free_minutes * 60) / 60) * Number(waiting.rules.price_per_minute)).toFixed(2) : '';
  return <>
    {waiting?.ended_at && <OperationReview key={waiting.id} booking={booking} operation={waiting}
      label="Attente du chauffeur" suggestion={suggestion} onChanged={onChanged} />}
    {booking.route_change && <OperationReview key={booking.route_change.id} booking={booking} operation={booking.route_change}
      label="Modification du trajet" onChanged={onChanged} />}
  </>;
}
