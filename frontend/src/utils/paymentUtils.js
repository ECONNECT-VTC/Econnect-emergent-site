export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cb', label: 'Carte bancaire' },
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cash', label: 'Espèces' },
];

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'À payer' },
  { value: 'paid', label: 'Payée' },
];

export const normalizePaymentMethod = (value) => {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (raw.includes('cb') || raw.includes('carte') || raw.includes('card') || raw.includes('bleue')) return 'cb';
  if (raw.includes('cash') || raw.includes('espece') || raw.includes('especes')) return 'cash';
  if (raw.includes('virement')) return 'virement';
  return '';
};

export const normalizeEditablePaymentStatus = (value) => {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (raw === 'paid' || raw === 'payee' || raw === 'paye') return 'paid';
  if (['pending', 'due', 'a payer', 'a_payer', 'not_required', ''].includes(raw)) return 'pending';
  return 'pending';
};

export const formatPaymentMethodLabel = (value) =>
  PAYMENT_METHOD_OPTIONS.find((option) => option.value === normalizePaymentMethod(value))?.label || 'Non renseigné';

export const formatPaymentStatusLabel = (value) => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (normalized === 'paid' || normalized === 'payee' || normalized === 'paye') return 'Payée';
  if (normalized === 'refunded') return 'Remboursée';
  if (normalized === 'partially_refunded') return 'Partiellement remboursée';
  if (normalized === 'failed') return 'Paiement échoué';
  return 'À payer';
};
