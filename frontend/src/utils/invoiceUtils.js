/**
 * Invoice utilities for ECONNECT VTC
 * French invoice compliance helpers
 */

/**
 * Format a 6-digit sequential invoice number
 * @param {number|string} seq - Sequence number
 * @returns {string} Zero-padded 6-digit number (e.g. "000001")
 */
export const formatInvoiceNumber = (seq) => {
  const n = parseInt(seq, 10);
  if (isNaN(n) || n < 1) return '000001';
  if (n > 999999) return '999999';
  return String(n).padStart(6, '0');
};

/**
 * Validate that an invoice number respects the 6-digit format
 * @param {string} invoiceNumber
 * @returns {boolean}
 */
export const isValidInvoiceNumber = (invoiceNumber) =>
  /^\d{6}$/.test(String(invoiceNumber));

/**
 * Format a date in French locale
 * @param {Date|string} date
 * @returns {string} e.g. "16 mai 2026"
 */
export const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Calculate due date from invoice date + payment terms
 * @param {Date|string} invoiceDate
 * @param {number} days - Default 30 days
 * @returns {string} Formatted due date
 */
export const calculateDueDate = (invoiceDate, days = 30) => {
  const d = invoiceDate instanceof Date ? new Date(invoiceDate) : new Date(invoiceDate);
  d.setDate(d.getDate() + days);
  return formatDate(d);
};

/**
 * Format an amount in Euro (French locale)
 * @param {number} amount
 * @returns {string} e.g. "1 234,56 €"
 */
export const formatCurrency = (amount) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
    Number(amount) || 0
  );

/**
 * Compute VAT-inclusive breakdown from a TTC amount
 * @param {number} priceTtc
 * @param {number} tvaRate - e.g. 0.10 for 10%
 * @returns {{ ht: number, tva: number, ttc: number }}
 */
export const computeHtFromTtc = (priceTtc, tvaRate) => {
  const ttc = Number(priceTtc) || 0;
  const rate = Number(tvaRate) || 0;
  const ht = rate > 0 ? ttc / (1 + rate) : ttc;
  const tva = ttc - ht;
  return {
    ht: Math.round((ht + Number.EPSILON) * 100) / 100,
    tva: Math.round((tva + Number.EPSILON) * 100) / 100,
    ttc: Math.round((ttc + Number.EPSILON) * 100) / 100,
  };
};

/**
 * Human-readable label for invoice type
 * @param {string} type - "invoice" | "driver" | "commission" | "order"
 * @returns {string}
 */
export const invoiceTypeLabel = (type) => {
  const labels = {
    invoice: 'Facture Client',
    driver: 'Facture Chauffeur',
    commission: 'Facture Commission',
    order: 'Bon de Commande',
  };
  return labels[type] || type;
};

/**
 * Badge colour class based on invoice type (Tailwind)
 * @param {string} type
 * @returns {string}
 */
export const invoiceTypeBadgeClass = (type) => {
  const classes = {
    invoice: 'bg-blue-500/20 text-blue-300',
    driver: 'bg-green-500/20 text-green-300',
    commission: 'bg-yellow-500/20 text-yellow-300',
    order: 'bg-purple-500/20 text-purple-300',
  };
  return classes[type] || 'bg-white/10 text-white';
};
