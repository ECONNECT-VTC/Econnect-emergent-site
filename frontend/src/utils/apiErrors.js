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
  if (status) {
    return statusText ? `HTTP ${status} — ${statusText}` : `HTTP ${status}`;
  }

  if (error?.message === 'Network Error') {
    return 'Erreur réseau : impossible de joindre le serveur';
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
