import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';
import { isLegalText, LEGAL_DOCUMENTS } from '@/utils/legalDocuments';
import LegalDocumentContent from '@/components/LegalDocumentContent';

export default function LegalDocument({ kind }) {
  const { lang = 'fr' } = useParams();
  const [params] = useSearchParams();
  const version = params.get('version') || '';
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const definition = LEGAL_DOCUMENTS.find((item) => item.kind === kind);

  useEffect(() => {
    const controller = new AbortController();
    setDocument(null);
    setLoading(true);
    setError('');
    const query = version ? `?version=${encodeURIComponent(version)}` : '';
    axios.get(`${API_URL}/api/legal-documents/${kind}${query}`, { signal: controller.signal, timeout: 15000 })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (!isLegalText(data) || typeof data.version !== 'string' || data.kind !== kind
          || (version && data.version !== version)) {
          throw new Error('Réponse du document légal invalide.');
        }
        setDocument(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted && !axios.isCancel(err)) {
          setError(err.response?.status === 404
            ? version ? 'Cette version du document est introuvable.' : 'Ce document n’a pas encore été publié.'
            : parseApiError(err, 'Impossible de charger ce document.'));
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, version, attempt]);

  return (
    <main className="min-h-screen bg-[#0A0A0A] px-5 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <a href={`/${lang}#reserver`} className="text-[#D4AF37] underline">Retour à la réservation</a>
        <h1 className="text-3xl text-[#D4AF37]">{definition.title}</h1>
        {loading && <p role="status" className="text-[#C7B588]">Chargement du document…</p>}
        {error && <div role="alert" className="text-red-300"><p>{error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 underline">Réessayer</button>
        </div>}
        {document && <>
          <p className="break-all text-sm text-[#A1A1AA]">Version : {document.version}
            {document.published_at ? ` · Publiée le ${new Date(document.published_at).toLocaleString('fr-FR')}` : ''}</p>
          {version && <a href={`/${lang}/${definition.path}`} className="inline-block text-[#D4AF37] underline">Voir la version actuelle</a>}
          <a className="block text-[#D4AF37] underline"
            href={`${API_URL}/api/legal-documents/${kind}/${encodeURIComponent(document.version)}/pdf`}>Télécharger cette version en PDF</a>
          <LegalDocumentContent document={document} />
        </>}
      </div>
    </main>
  );
}
