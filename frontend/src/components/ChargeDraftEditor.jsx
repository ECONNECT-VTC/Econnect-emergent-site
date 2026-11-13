import { useEffect, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';
import SupplementaryInvoices from './SupplementaryInvoices';

const blankLine = () => ({
  description: '', quantity: '1', unit_price_ttc: '', tax_treatment: 'vat', vat_percent: '', tax_reason: '',
});
const inputClass = 'w-full rounded border border-white/20 bg-[#1E1E1E] p-2 text-white';

export default function ChargeDraftEditor({ bookingId }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [lines, setLines] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const url = `${API_URL}/api/admin/bookings/${encodeURIComponent(bookingId)}/charge-draft`;
  const locked = busy || billingBusy;

  useEffect(() => {
    const warn = (event) => {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const load = async () => {
    if (dirty && !window.confirm('Les modifications non enregistrées seront perdues. Continuer ?')) return;
    setOpen(true);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await axios.get(url, { withCredentials: true, timeout: 15000 });
      if (!Number.isInteger(data?.revision) || !Array.isArray(data?.lines)) throw new Error('Brouillon de frais invalide.');
      setDraft(data);
      setLines(data.lines.map((line) => ({ ...line, vat_percent: line.vat_percent ?? '', tax_reason: line.tax_reason ?? '' })));
      setDirty(false);
    } catch (err) {
      setError(parseApiError(err, 'Impossible de charger le brouillon de frais.'));
    } finally { setBusy(false); }
  };
  const change = (index, patch) => {
    setLines((current) => current.map((line, position) => position === index ? { ...line, ...patch } : line));
    setDirty(true);
    setNotice('');
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        revision: draft.revision,
        lines: lines.map((line) => ({
          ...line,
          vat_percent: line.tax_treatment === 'vat' ? line.vat_percent : null,
          tax_reason: line.tax_reason.trim() || null,
        })),
      };
      const { data } = await axios.put(url, payload, { withCredentials: true, timeout: 15000 });
      if (!Number.isInteger(data?.revision) || !Array.isArray(data?.lines)) throw new Error('Réponse de sauvegarde invalide.');
      setDraft(data);
      setLines(data.lines.map((line) => ({ ...line, vat_percent: line.vat_percent ?? '', tax_reason: line.tax_reason ?? '' })));
      setDirty(false);
      setNotice('Brouillon enregistré : aucun frais facturé ni paiement demandé.');
    } catch (err) {
      setError(parseApiError(err, 'Impossible d’enregistrer le brouillon de frais.'));
    } finally { setBusy(false); }
  };
  const close = () => {
    if (dirty && !window.confirm('Fermer supprimera les modifications non enregistrées. Continuer ?')) return;
    setOpen(false);
    setDraft(null);
    setDirty(false);
    setError('');
  };
  if (!open) return <button type="button" onClick={load} className="mt-4 rounded border border-[#D4AF37] px-3 py-1 text-sm text-[#D4AF37]">Préparer des frais</button>;

  return <section className="mt-4 space-y-3 rounded border border-[#D4AF37]/30 p-4" aria-label="Brouillon de frais">
    <h3 className="font-semibold text-[#D4AF37]">Brouillon de frais</h3>
    <p className="text-sm text-amber-200">Préparation uniquement : ces lignes ne sont pas encore facturées, n’affectent pas le solde et ne sont pas envoyées au client.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {notice && <p role="status" className="text-green-300">{notice}</p>}
    {busy && <p role="status">Chargement…</p>}
    {!busy && !draft && <button type="button" onClick={load}>Réessayer</button>}
    {draft && <form onSubmit={save} className="space-y-4">
      {lines.map((line, index) => <fieldset disabled={locked} key={index} className="space-y-2 rounded border border-white/10 p-3">
        <legend>Frais {index + 1}</legend>
        <label className="block text-sm">Libellé
          <input required maxLength={160} className={inputClass} value={line.description}
            onChange={(event) => change(index, { description: event.target.value })} /></label>
        <label className="block text-sm">Quantité
          <input required type="number" min="0.001" max="100000" step="0.001" className={inputClass}
            value={line.quantity} onChange={(event) => change(index, { quantity: event.target.value })} /></label>
        <label className="block text-sm">Prix unitaire TTC (€)
          <input required type="number" min="0.01" max="1000000" step="0.01" className={inputClass}
            value={line.unit_price_ttc} onChange={(event) => change(index, { unit_price_ttc: event.target.value })} /></label>
        <label className="block text-sm">Traitement de TVA
          <select className={inputClass} value={line.tax_treatment}
            onChange={(event) => change(index, { tax_treatment: event.target.value, vat_percent: '' })}>
            <option value="vat">TVA applicable</option>
            <option value="exempt">Exonéré</option>
            <option value="outside_scope">Hors champ TVA</option>
          </select></label>
        {line.tax_treatment === 'vat' && <label className="block text-sm">Taux de TVA (%)
          <input required type="number" min="0" max="100" step="0.01" className={inputClass}
            value={line.vat_percent} onChange={(event) => change(index, { vat_percent: event.target.value })} /></label>}
        <label className="block text-sm">Motif de TVA {line.tax_treatment !== 'vat' || Number(line.vat_percent) === 0 ? '(obligatoire)' : '(facultatif)'}
          <input maxLength={300} required={line.tax_treatment !== 'vat' || (line.vat_percent !== '' && Number(line.vat_percent) === 0)}
            className={inputClass} value={line.tax_reason} onChange={(event) => change(index, { tax_reason: event.target.value })} /></label>
        <button type="button" onClick={() => { setLines(lines.filter((_, position) => position !== index)); setDirty(true); }}>Supprimer ce frais</button>
      </fieldset>)}
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" disabled={locked || lines.length >= 40} onClick={() => { setLines([...lines, blankLine()]); setDirty(true); }}>Ajouter un frais</button>
        <button type="submit" disabled={locked || !dirty}>Enregistrer le brouillon</button>
        <button type="button" disabled={locked} onClick={load}>Recharger</button>
        <button type="button" disabled={locked} onClick={close}>Fermer</button>
      </div>
    </form>}
    {draft && <SupplementaryInvoices bookingId={bookingId} revision={draft.revision}
      hasLines={draft.lines.length > 0} dirty={dirty} onChanged={load} onBusyChange={setBillingBusy} />}
    {!draft && !busy && <button type="button" onClick={close}>Fermer</button>}
  </section>;
}
