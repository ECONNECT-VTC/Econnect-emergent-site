export const parseBookingError = (error, fallback = 'Erreur inconnue') => {
  const detail = error?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const field = Array.isArray(e?.loc) ? e.loc[e.loc.length - 1] : 'champ';
        return `${field || 'champ'}: ${e?.msg || 'valeur invalide'}`;
      })
      .join(' | ');
  }
  return fallback;
};
