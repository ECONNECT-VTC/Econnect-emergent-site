import {
  formatInvoiceNumber,
  isValidInvoiceNumber,
  generateInvoiceNumber,
  calculateVatAmount,
  getClientVatRate,
} from './invoiceUtils';

describe('invoiceUtils', () => {
  it('formats and generates 6-digit sequential invoice numbers', () => {
    expect(formatInvoiceNumber(1)).toBe('000001');
    expect(generateInvoiceNumber(1)).toBe('000002');
    expect(formatInvoiceNumber(999999)).toBe('999999');
  });

  it('validates strict 6-digit invoice numbers', () => {
    expect(isValidInvoiceNumber('000001')).toBe(true);
    expect(isValidInvoiceNumber('12345')).toBe(false);
    expect(isValidInvoiceNumber('ABC123')).toBe(false);
  });

  it('calculates VAT with French default rate of 20%', () => {
    expect(calculateVatAmount(100)).toBe(20);
    expect(calculateVatAmount(100, 0.1)).toBe(10);
  });

  it('returns 20% VAT for disposition and 10% otherwise', () => {
    expect(getClientVatRate('disposition')).toBe(0.2);
    expect(getClientVatRate('mise à disposition')).toBe(0.2);
    expect(getClientVatRate('MISE A DISPOSITION')).toBe(0.2);
    expect(getClientVatRate('')).toBe(0.1);
    expect(getClientVatRate(undefined)).toBe(0.1);
    expect(getClientVatRate(null)).toBe(0.1);
    expect(getClientVatRate('simple')).toBe(0.1);
  });
});
