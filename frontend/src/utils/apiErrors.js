import { API_URL_SOURCE } from '../config';

export const parseApiError = (error, fallback = 'Erreur inconnue') => {
  const detail = error?.response?.data?.detail ?? error?.response?.data?.message;

  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((entry) => {
        const field = Array.isArray(entry?.loc) ? entry.loc[entry.loc.length - 1] : 'champ';
        return `${field}: ${entry?.msg || 'valeur invalide'}`;
      })
      .join(' | ');
  }

  const status = error?.response?.status;
  const statusText = error?.response?.statusText;
  if (status >= 500) {
    return "Le serveur a rencontré une erreur. Vérifiez la configuration de l'API, du proxy Hostinger et du service email.";
  }
  if (status) {
    return statusText ? `HTTP ${status} — ${statusText}` : `HTTP ${status}`;
  }

  if (error?.message === 'Network Error' || error?.code === 'ERR_NETWORK') {
    if (API_URL_SOURCE === 'localhost-fallback') {
      return "Impossible de joindre l'API. Vérifiez la variable d'environnement REACT_APP_API_URL sur Hostinger et la disponibilité du backend.";
    }
    return "Erreur réseau : impossible de joindre le serveur. Vérifiez l'URL API configurée, le proxy Hostinger et le CORS.";
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

export const logApiError = (scope, error) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${scope}]`, error);
  }
};
