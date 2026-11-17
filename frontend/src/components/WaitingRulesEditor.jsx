import { useEffect, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function WaitingRulesEditor() {
  const [rules, setRules] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setError('');
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/waiting-rules`, { withCredentials: true });
      setRules(data);
    } catch (err) { setError(parseApiError(err, 'Chargement du barème impossible.')); }
  };
  useEffect(() => { load(); }, []);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await axios.put(`${API_URL}/api/admin/waiting-rules`, {
        ...rules, free_minutes: Number(rules.free_minutes),
      }, { withCredentials: true });
      setRules(data); setNotice('Barème enregistré pour les prochaines attentes uniquement.');
    } catch (err) { setError(parseApiError(err, 'Sauvegarde du barème impossible.')); }
    finally { setBusy(false); }
  };
  return <section className="mb-6 space-y-3 rounded border border-[#D4AF37]/30 p-4">
    <h2 className="text-xl">Barème d’attente chauffeur</h2>
    <p className="text-sm">Le compteur commence au clic « Arrivé / En attente » et s’arrête au départ. Chaque minute entamée après la franchise est proposée à l’admin, jamais facturée automatiquement.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!rules ? <Button type="button" onClick={load}>Charger le barème</Button> : <form onSubmit={save} className="space-y-3">
      <label className="flex items-center gap-2"><input type="checkbox" checked={rules.enabled} onChange={(event) => setRules({ ...rules, enabled: event.target.checked })} />Activer les estimations de frais d’attente</label>
      <label className="block">Minutes incluses<Input type="number" min="0" max="1440" step="1" required value={rules.free_minutes}
        onChange={(event) => setRules({ ...rules, free_minutes: event.target.value })} /></label>
      <label className="block">Prix TTC par minute supplémentaire (€)<Input type="number" min="0" max="1000" step="0.01" required value={rules.price_per_minute}
        onChange={(event) => setRules({ ...rules, price_per_minute: event.target.value })} /></label>
      <Button type="submit" disabled={busy}>Enregistrer le barème d’attente</Button>
    </form>}
  </section>;
}
