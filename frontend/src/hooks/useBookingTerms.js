import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';
import { parseApiError } from '@/utils/apiErrors';

export default function useBookingTerms() {
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acceptedVersion, setAcceptedVersion] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setTerms(null);
    setAcceptedVersion(null);
    axios.get(`${API_URL}/api/booking-terms`, { signal: controller.signal, timeout: 15000 })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (typeof data?.enabled !== 'boolean' || typeof data?.version !== 'string'
          || !data.version || typeof data?.title !== 'string' || !Array.isArray(data?.sections)
          || !data.sections.every((section) => typeof section?.heading === 'string'
            && Array.isArray(section?.paragraphs) && section.paragraphs.every((text) => typeof text === 'string'))) {
          throw new Error('Réponse des conditions de vente invalide.');
        }
        setTerms(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted && !axios.isCancel(err)) {
          setError(parseApiError(err, 'Impossible de charger les conditions de vente.'));
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const validate = useCallback((payload) => {
    if (loading) return 'Veuillez attendre le chargement des conditions de vente.';
    if (error || !terms) return 'Conditions de vente indisponibles. Réessayez avant de réserver.';
    if (terms.enabled && (payload?.terms_accepted !== true || payload?.terms_version !== terms.version)) {
      return 'Veuillez lire et accepter la version actuelle des conditions de vente.';
    }
    return '';
  }, [terms, loading, error]);

  const accepted = Boolean(terms && acceptedVersion === terms.version);
  const payload = terms?.enabled ? { terms_accepted: accepted, terms_version: terms.version } : {};
  const setAccepted = useCallback((value) => setAcceptedVersion(value ? terms?.version : null), [terms?.version]);

  return {
    terms, loading, error, accepted, payload, validate,
    ready: !validate(payload),
    setAccepted,
    retry: () => setAttempt((value) => value + 1),
  };
}
