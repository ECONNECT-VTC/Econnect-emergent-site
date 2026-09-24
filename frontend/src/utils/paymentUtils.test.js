import {
  formatPaymentMethodLabel,
  formatPaymentStatusLabel,
  normalizeEditablePaymentStatus,
  normalizePaymentMethod,
} from './paymentUtils';

describe('paymentUtils', () => {
  it('normalizes supported payment methods', () => {
    expect(normalizePaymentMethod('Carte bancaire')).toBe('cb');
    expect(normalizePaymentMethod('card')).toBe('cb');
    expect(normalizePaymentMethod('espèces')).toBe('cash');
    expect(normalizePaymentMethod('Virement bancaire')).toBe('virement');
    expect(normalizePaymentMethod('transfer')).toBe('virement');
  });

  it('formats robust payment labels for legacy values', () => {
    expect(formatPaymentMethodLabel('cb')).toBe('Carte bancaire');
    expect(formatPaymentMethodLabel('')).toBe('Non renseigné');
    expect(formatPaymentStatusLabel('paid')).toBe('Payée');
    expect(formatPaymentStatusLabel('partially_paid')).toBe('Paiement partiel');
    expect(formatPaymentStatusLabel('not_required')).toBe('À payer');
  });

  it('maps editable payment statuses to supported admin values', () => {
    expect(normalizeEditablePaymentStatus('payée')).toBe('paid');
    expect(normalizeEditablePaymentStatus('partiellement payée')).toBe('partially_paid');
    expect(normalizeEditablePaymentStatus('due')).toBe('pending');
    expect(normalizeEditablePaymentStatus('')).toBe('pending');
  });
});
