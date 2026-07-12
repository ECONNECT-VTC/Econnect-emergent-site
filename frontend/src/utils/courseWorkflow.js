const LEGACY_TO_WORKFLOW = {
  pending: 'DRAFT',
  received: 'QUOTE_ACCEPTED',
  assigned: 'ASSIGNED',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  invoiced: 'INVOICED',
  paid: 'PAID',
  cancellation_requested: 'cancellation_requested',
  cancelled: 'cancelled',
};

export const WORKFLOW_ORDER = [
  'DRAFT',
  'QUOTE_SENT',
  'QUOTE_ACCEPTED',
  'ORDER_ISSUED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'PAID',
];

export const normalizeCourseStatus = (status) => {
  if (!status) return status;
  if (WORKFLOW_ORDER.includes(status)) return status;
  return LEGACY_TO_WORKFLOW[String(status).toLowerCase()] || status;
};

export const COURSE_STATUS_STYLES = {
  DRAFT: 'bg-yellow-500/20 text-yellow-400',
  QUOTE_SENT: 'bg-blue-500/20 text-blue-300',
  QUOTE_ACCEPTED: 'bg-indigo-500/20 text-indigo-300',
  ORDER_ISSUED: 'bg-fuchsia-500/20 text-fuchsia-300',
  ASSIGNED: 'bg-cyan-500/20 text-cyan-300',
  IN_PROGRESS: 'bg-purple-500/20 text-purple-400',
  COMPLETED: 'bg-green-500/20 text-green-400',
  INVOICED: 'bg-emerald-500/20 text-emerald-300',
  PAID: 'bg-lime-500/20 text-lime-300',
  cancellation_requested: 'bg-orange-500/20 text-orange-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

export const COURSE_STATUS_LABELS = {
  DRAFT: 'Brouillon',
  QUOTE_SENT: 'Devis envoyé',
  QUOTE_ACCEPTED: 'Devis accepté',
  ORDER_ISSUED: 'Bon de commande émis',
  ASSIGNED: 'Assignée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  INVOICED: 'Facturée',
  PAID: 'Payée',
  cancellation_requested: 'Annulation demandée',
  cancelled: 'Annulée',
};

export const isStatusAtOrAfter = (status, referenceStatus) => {
  const normalized = normalizeCourseStatus(status);
  const currentIndex = WORKFLOW_ORDER.indexOf(normalized);
  const referenceIndex = WORKFLOW_ORDER.indexOf(referenceStatus);
  return currentIndex >= 0 && referenceIndex >= 0 && currentIndex >= referenceIndex;
};

export const statusEquals = (status, expectedStatus) => normalizeCourseStatus(status) === expectedStatus;
