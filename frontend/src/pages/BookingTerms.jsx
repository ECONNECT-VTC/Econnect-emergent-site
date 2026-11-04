import { useParams, useSearchParams } from 'react-router-dom';
import useBookingTerms from '@/hooks/useBookingTerms';
import API_URL from '@/config';

export default function BookingTerms() {
  const { lang = 'fr' } = useParams();
  const [params] = useSearchParams();
  const { terms, loading, error, retry } = useBookingTerms();
  const requestedVersion = params.get('version');
  const historical = terms && requestedVersion && requestedVersion !== terms.version;
  const pdfVersion = requestedVersion || terms?.version;
  return (
    <main className="min-h-screen bg-[#0A0A0A] px-5 py-12 text-[#C7B588]">
      <article className="mx-auto max-w-3xl space-y-6">
        <a href={`/${lang}#reserver`} className="text-[#D4AF37] underline">Retour à la réservation</a>
        <h1 className="text-3xl text-[#D4AF37]">Conditions générales de vente et de transport</h1>
        {loading && <p role="status">Chargement des conditions…</p>}
        {error && <div role="alert"><p>{error}</p><button type="button" onClick={retry} className="underline">Réessayer</button></div>}
        {terms && <>
          {!terms.enabled && <p role="note" className="rounded border border-amber-400 p-4">Projet de conditions, non activé pour les réservations. Validation juridique et informations de l’entreprise à compléter avant publication.</p>}
          <p>Version : {pdfVersion}</p>
          <a className="inline-block text-[#D4AF37] underline"
            href={`${API_URL}/api/booking-terms/${encodeURIComponent(pdfVersion)}/pdf`}>Télécharger cette version en PDF</a>
          {historical ? <p>Pour consulter cette version archivée, téléchargez le PDF ci-dessus.</p>
            : terms.sections.map((section, index) => (
              <section key={index} className="space-y-3">
                <h2 className="text-xl text-white">{section.heading}</h2>
                {section.paragraphs.map((text, paragraph) => <p key={paragraph} className="whitespace-pre-line">{text}</p>)}
              </section>
            ))}
        </>}
      </article>
    </main>
  );
}
