const ADMIN_LABEL_REGEX = /\badmin(?:istrateur)?\b/i;

const normalizeName = (value) => (typeof value === 'string' ? value.trim() : '');

const isAdminLikeLabel = (value) => ADMIN_LABEL_REGEX.test(normalizeName(value));

export const getClientFacingDriverName = (booking) => {
  const candidates = [
    booking?.driver_display_name,
    booking?.driver_name,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeName(candidate);
    if (normalized && !isAdminLikeLabel(normalized)) {
      return normalized;
    }
  }

  return 'Chauffeur non assigné';
};

export const shouldRenderAssignedDriverForAdmin = (booking) => Boolean(
  normalizeName(booking?.driver_display_name) || normalizeName(booking?.driver_name),
);
