export default function BookingTermsAcceptance({ consent, lang = 'fr' }) {
  if (consent.loading) return <p role="status" className="text-sm text-[#C7B588]">Chargement des conditions de vente…</p>;
  if (consent.error) {
    return (
      <div role="alert" className="text-sm text-red-300">
        <p>Conditions de vente indisponibles : {consent.error}</p>
        <button type="button" onClick={consent.retry} className="mt-2 underline">Réessayer</button>
      </div>
    );
  }
  if (!consent.terms?.enabled) return null;
  const href = `/${lang}/conditions-generales?version=${encodeURIComponent(consent.terms.version)}`;
  return (
    <div className="rounded-xl border border-[#D4AF37]/30 p-4 text-sm text-[#C7B588]">
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={consent.accepted} onChange={(event) => consent.setAccepted(event.target.checked)}
          required className="mt-1 accent-[#D4AF37]" data-testid="booking-terms-acceptance" />
        <span>J’ai lu et j’accepte les <a href={href} target="_blank" rel="noopener noreferrer"
          className="text-[#D4AF37] underline">conditions générales de vente et de transport</a>
          {' '}(version {consent.terms.version}).</span>
      </label>
    </div>
  );
}
