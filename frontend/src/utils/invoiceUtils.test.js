import {
  formatInvoiceNumber,
  isValidInvoiceNumber,
  generateInvoiceNumber,
  calculateVatAmount,
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
});
