import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';
import { copyLegalDraft, isLegalRecord, isLegalText, LEGAL_DOCUMENTS } from '@/utils/legalDocuments';
import LegalDocumentContent from '@/components/LegalDocumentContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const fieldClass = 'border-white/20 bg-[#1E1E1E] text-white';
const apiOptions = { withCredentials: true, timeout: 15000 };

export default function AdminLegalDocuments() {
  const { lang = 'fr' } = useParams();
  const [records, setRecords] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [dirty, setDirty] = useState({});
  const [kind, setKind] = useState('terms');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const [archived, setArchived] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const record = records.find((item) => item.kind === kind);
  const draft = drafts[kind];
  const definition = LEGAL_DOCUMENTS.find((item) => item.kind === kind);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    axios.get(`${API_URL}/api/admin/legal-documents`, { ...apiOptions, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data?.documents) || data.documents.length !== LEGAL_DOCUMENTS.length
          || !data.documents.every(isLegalRecord)
          || !LEGAL_DOCUMENTS.every((item) => data.documents.some((value) => value.kind === item.kind))) {
          throw new Error('Réponse de la gestion des documents invalide.');
        }
        setRecords(data.documents);
        setDrafts(Object.fromEntries(data.documents.map((item) => [item.kind, copyLegalDraft(item.draft)])));
        setDirty({});
      })
      .catch((err) => {
        if (!controller.signal.aborted && !axios.isCancel(err)) setError(parseApiError(err, 'Chargement des documents impossible.'));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const warnUnsaved = (event) => {
      if (Object.values(dirty).some(Boolean)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, [dirty]);

  const selectKind = (value) => {
    setKind(value);
    setError('');
    setNotice('');
    setArchived(null);
    setPreview(false);
    setConfirmPublish(false);
  };
  const updateDraft = (patch, reviewChange = false) => {
    setDrafts((current) => ({ ...current, [kind]: {
      ...current[kind], ...patch, ...(!reviewChange ? { review_confirmed: false } : {}),
    } }));
    setDirty((current) => ({ ...current, [kind]: true }));
    setConfirmPublish(false);
    setNotice('');
  };
  const updateSection = (index, patch) => updateDraft({
    sections: draft.sections.map((section, position) => position === index ? { ...section, ...patch } : section),
  });
  const applyRecord = (value) => {
    if (!isLegalRecord(value) || value.kind !== kind) throw new Error('Réponse de sauvegarde invalide. Rechargez les documents.');
    setRecords((current) => current.map((item) => item.kind === kind ? value : item));
    setDrafts((current) => ({ ...current, [kind]: copyLegalDraft(value.draft) }));
    setDirty((current) => ({ ...current, [kind]: false }));
  };
  const saveDraft = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await axios.put(`${API_URL}/api/admin/legal-documents/${kind}/draft`,
        { revision: record.revision, ...draft }, apiOptions);
      applyRecord(data);
      setNotice('Brouillon enregistré. Le texte publié n’a pas changé.');
    } catch (err) {
      setError(parseApiError(err, 'Sauvegarde impossible.'));
    } finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await axios.post(`${API_URL}/api/admin/legal-documents/${kind}/publish`,
        { revision: record.revision }, apiOptions);
      applyRecord(data);
      setConfirmPublish(false);
      setNotice('Nouvelle version publiée. La version précédente reste dans l’historique.');
    } catch (err) {
      setError(parseApiError(err, 'Publication impossible.'));
    } finally { setBusy(false); }
  };
  const viewArchive = async (version) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await axios.get(
        `${API_URL}/api/admin/legal-documents/${kind}/versions/${encodeURIComponent(version)}`, apiOptions
      );
      if (!isLegalText(data) || data.kind !== kind || data.version !== version) throw new Error('Archive invalide.');
      setArchived(data);
      setPreview(false);
    } catch (err) {
      setError(parseApiError(err, 'Lecture de l’archive impossible.'));
    } finally { setBusy(false); }
  };
  const reload = () => {
    if (Object.values(dirty).some(Boolean)
      && !window.confirm('Recharger supprimera vos modifications non enregistrées. Continuer ?')) return;
    setArchived(null);
    setConfirmPublish(false);
    setNotice('');
    setAttempt((value) => value + 1);
  };

  if (loading) return <p role="status">Chargement des documents légaux…</p>;

  return (
    <div className="space-y-6 text-white" data-testid="admin-legal-documents">
      <div className="rounded-xl border border-[#D4AF37]/30 bg-[#141414] p-5 space-y-3">
        <h2 className="text-xl text-[#D4AF37]">Documents légaux</h2>
        <p>Modifiez le brouillon, prévisualisez puis publiez. La publication remplace le texte du site sans modifier les versions déjà acceptées.</p>
        <p className="text-sm text-[#C7B588]">Les textes proposés ne sont pas une validation juridique. Complétez les informations manquantes et faites relire chaque document avant publication.</p>
        <p className="text-sm text-[#C7B588]">Modifier un texte ne change pas automatiquement les règles du logiciel : vérifiez notamment la cohérence des frais, des remboursements et des durées de conservation annoncés.</p>
      </div>
      <div className="flex flex-wrap gap-3" role="group" aria-label="Choisir le document légal">
        {LEGAL_DOCUMENTS.map((item) => (
          <Button type="button" key={item.kind} disabled={busy} aria-pressed={kind === item.kind}
            variant={kind === item.kind ? 'default' : 'outline'} onClick={() => selectKind(item.kind)}>
            {item.label}{dirty[item.kind] ? ' *' : ''}
          </Button>
        ))}
        <Button type="button" variant="outline" disabled={busy} onClick={reload}>Recharger</Button>
      </div>
      {error && <p role="alert" className="whitespace-pre-line rounded border border-red-400/40 p-3 text-red-300">{error}</p>}
      {notice && <p role="status" className="text-[#F3D67A]">{notice}</p>}
      {record && draft && <>
        {kind === 'privacy' && <p role="note" className="rounded border border-amber-400/40 p-4 text-sm text-amber-200">
          Publier cette politique ne crée pas de bandeau de consentement aux traceurs. Vérifiez séparément le déclenchement de PostHog, les cookies, les prestataires et les durées de conservation réellement appliquées.
        </p>}
        <p className="break-all text-sm text-[#A1A1AA]">
          {record.published_version ? `Version en ligne : ${record.published_version}` : 'Aucune version publiée'}
          {' · '}Révision du brouillon : {record.revision}{dirty[kind] ? ' · Modifications non enregistrées' : ''}
        </p>
        {record.published_version && <a href={`/${lang}/${definition.path}`} target="_blank" rel="noopener noreferrer"
          className="inline-block text-[#D4AF37] underline">Voir le document en ligne</a>}
        <form onSubmit={saveDraft} className="space-y-5">
          <fieldset disabled={busy} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="legal-title">Titre du document</Label>
              <Input id="legal-title" value={draft.title} required maxLength={200} className={fieldClass}
                onChange={(event) => updateDraft({ title: event.target.value })} />
            </div>
            {draft.sections.map((section, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-white/15 bg-[#141414] p-4">
                <Label htmlFor={`legal-section-${index}`}>Titre du bloc {index + 1}</Label>
                <Input id={`legal-section-${index}`} value={section.heading} required maxLength={300} className={fieldClass}
                  onChange={(event) => updateSection(index, { heading: event.target.value })} />
                {section.paragraphs.map((text, paragraph) => (
                  <div key={paragraph} className="space-y-2">
                    <Label htmlFor={`legal-text-${index}-${paragraph}`}>Texte du bloc {index + 1}, paragraphe {paragraph + 1}</Label>
                    <Textarea id={`legal-text-${index}-${paragraph}`} value={text} required maxLength={12000}
                      className={`${fieldClass} min-h-[8rem]`}
                      onChange={(event) => updateSection(index, {
                        paragraphs: section.paragraphs.map((value, position) => position === paragraph ? event.target.value : value),
                      })} />
                    <Button type="button" variant="outline" disabled={section.paragraphs.length <= 1}
                      onClick={() => updateSection(index, { paragraphs: section.paragraphs.filter((_, position) => position !== paragraph) })}>
                      Supprimer le paragraphe {paragraph + 1} du bloc {index + 1}
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="outline" onClick={() => updateSection(index, { paragraphs: [...section.paragraphs, ''] })}>
                    Ajouter un paragraphe au bloc {index + 1}
                  </Button>
                  <Button type="button" variant="outline" disabled={draft.sections.length <= 1}
                    onClick={() => updateDraft({ sections: draft.sections.filter((_, position) => position !== index) })}>
                    Supprimer le bloc {index + 1}
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => updateDraft({
              sections: [...draft.sections, { heading: '', paragraphs: [''] }],
            })}>Ajouter un bloc</Button>
            <label className="flex items-start gap-3 text-sm text-[#C7B588]">
              <input type="checkbox" checked={draft.review_confirmed} className="mt-1 accent-[#D4AF37]"
                onChange={(event) => updateDraft({ review_confirmed: event.target.checked }, true)} />
              <span>Je confirme avoir complété et fait vérifier ce texte avant sa publication, notamment les informations légales et les pratiques réelles du site.</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!dirty[kind]} data-testid="save-legal-draft">Enregistrer le brouillon</Button>
              <Button type="button" variant="outline" onClick={() => { setPreview(!preview); setArchived(null); }}>Prévisualiser</Button>
              <Button type="button" disabled={Boolean(dirty[kind]) || !draft.review_confirmed}
                onClick={() => setConfirmPublish(true)} data-testid="publish-legal-draft">Publier une nouvelle version</Button>
            </div>
          </fieldset>
        </form>
        {confirmPublish && <div role="dialog" aria-modal="false" aria-label="Confirmer la publication"
          className="space-y-4 rounded-xl border border-[#D4AF37] bg-[#141414] p-5">
          <p>Le texte enregistré remplacera le document visible sur le site. Les anciennes versions resteront archivées.
            {kind === 'terms' && ' Les nouvelles réservations devront accepter ces CGV, sauf désactivation explicite côté serveur.'}</p>
          <div className="flex gap-3">
            <Button type="button" disabled={busy} onClick={publish}>Confirmer la publication</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmPublish(false)}>Annuler</Button>
          </div>
        </div>}
        {(preview || archived) && <div className="space-y-4 rounded-xl border border-[#D4AF37]/30 bg-[#141414] p-5">
          <h2 className="text-lg text-[#D4AF37]">{archived ? `Archive en lecture seule : ${archived.version}` : 'Aperçu du brouillon — non publié'}</h2>
          <LegalDocumentContent document={archived || draft} />
          <Button type="button" variant="outline" onClick={() => { setPreview(false); setArchived(null); }}>Fermer l’aperçu</Button>
        </div>}
        <section className="space-y-3">
          <h2 className="text-xl text-[#D4AF37]">Historique des publications</h2>
          {!record.history.length && <p className="text-[#A1A1AA]">Aucune publication.</p>}
          {record.history.map((item) => (
            <div key={item.version} className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/15 p-3">
              <p className="break-all text-sm">{item.title} · {new Date(item.published_at).toLocaleString('fr-FR')}
                {' · '}{item.version}{item.published_by ? ` · Admin : ${item.published_by}` : ''}</p>
              <Button type="button" variant="outline" disabled={busy} onClick={() => viewArchive(item.version)}>Consulter {item.version}</Button>
            </div>
          ))}
        </section>
      </>}
    </div>
  );
}
