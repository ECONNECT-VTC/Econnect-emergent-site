export const parseBookingError = (error, fallback = 'Erreur inconnue') => {
  const detail = error?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const field = Array.isArray(e?.loc) ? e.loc[e.loc.length - 1] : 'champ';
        return `${field}: ${e?.msg || 'valeur invalide'}`;
      })
      .join(' | ');
  }
  return fallback;
};

export const buildEstimatePriceQuery = ({
  transferType,
  distance,
  duration,
  dispositionHours,
}) => {
  const params = new URLSearchParams();
  params.set('transfer_type', transferType || 'simple');

  if (transferType === 'disposition') {
    const parsedHours = Number(dispositionHours);
    if (!(parsedHours > 0)) return null;
    params.set('disposition_hours', String(parsedHours));
    return params.toString();
  }

  const parsedDistance = Number(distance);
  if (!(parsedDistance > 0)) return null;

  params.set('distance_km', String(parsedDistance));

  const parsedDuration = Number(duration);
  if (Number.isFinite(parsedDuration) && parsedDuration >= 0) {
    params.set('duration_minutes', String(parsedDuration));
  }

  return params.toString();
};
