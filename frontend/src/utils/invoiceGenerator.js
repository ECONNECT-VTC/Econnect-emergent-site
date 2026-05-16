/**
 * invoiceGenerator.js
 * Triggers the browser print/save-as-PDF workflow for invoice templates.
 */

/**
 * Print or save the current page as PDF.
 * Opens the browser print dialog so the user can save to PDF.
 */
export const printInvoice = () => {
  window.print();
};

/**
 * Open the backend-generated PDF for a given booking in a new tab.
 * @param {string} apiUrl  - Base API URL (e.g. from config.js)
 * @param {string} bookingId
 * @param {'invoice'|'driver'|'commission'|'order'} type
 */
export const downloadInvoicePdf = (apiUrl, bookingId, type = 'invoice') => {
  const pathMap = {
    invoice: `/api/admin/invoices/${bookingId}/pdf`,
    driver: `/api/admin/invoices/${bookingId}/driver-pdf`,
    commission: `/api/admin/invoices/${bookingId}/commission-pdf`,
    order: `/api/admin/orders/${bookingId}/pdf`,
  };
  const path = pathMap[type] || pathMap.invoice;
  window.open(`${apiUrl}${path}`, '_blank');
};

/**
 * Download a driver's own invoice PDF.
 * @param {string} apiUrl
 * @param {string} bookingId
 */
export const downloadDriverInvoicePdf = (apiUrl, bookingId) => {
  window.open(`${apiUrl}/api/driver/invoices/${bookingId}/pdf`, '_blank');
};
