export const toOptionalNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildAdminEstimatePriceQuery = ({
  transferType,
  distanceKm,
  durationMinutes,
  dispositionHours,
}) => {
  const params = new URLSearchParams();
  params.set('transfer_type', transferType || 'simple');

  if (transferType === 'disposition') {
    const parsedHours = toOptionalNumber(dispositionHours);
    if (!(parsedHours > 0)) return null;
    params.set('disposition_hours', String(parsedHours));
    return params.toString();
  }

  const parsedDistance = toOptionalNumber(distanceKm);
  if (!(parsedDistance > 0)) return null;
  params.set('distance_km', String(parsedDistance));

  const parsedDuration = toOptionalNumber(durationMinutes);
  if (parsedDuration !== null && parsedDuration >= 0) {
    params.set('duration_minutes', String(parsedDuration));
  }

  return params.toString();
};
