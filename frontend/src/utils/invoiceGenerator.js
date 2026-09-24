/**
 * invoiceGenerator.js
 * Triggers the browser print/save-as-PDF workflow for invoice templates.
 */

import { isStatusAtOrAfter } from './courseWorkflow';

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
 * @param {'quote'|'invoice'|'driver'|'commission'|'order'|'activity'} type
 */
export const downloadInvoicePdf = (apiUrl, bookingId, type = 'invoice') => {
  const pathMap = {
    quote: `/api/admin/quotes/${bookingId}/pdf`,
    invoice: `/api/admin/invoices/${bookingId}/pdf`,
    driver: `/api/admin/invoices/${bookingId}/driver-pdf`,
    commission: `/api/admin/invoices/${bookingId}/commission-pdf`,
    order: `/api/admin/orders/${bookingId}/pdf`,
    activity: `/api/admin/invoices/${bookingId}/activity-pdf`,
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

export const downloadDriverDocPdf = (apiUrl, bookingId, type) => {
  const pathMap = {
    driver: `/api/driver/invoices/${bookingId}/pdf`,
    order: `/api/driver/invoices/${bookingId}/order-pdf`,
    commission: `/api/driver/invoices/${bookingId}/commission-pdf`,
    activity: `/api/driver/invoices/${bookingId}/activity-pdf`,
  };

  window.open(`${apiUrl}${pathMap[type] || pathMap.driver}`, '_blank');
};

/**
 * Download the client's own invoice PDF for a completed booking.
 * @param {string} apiUrl
 * @param {string} bookingId
 * @param {string} bookingStatus
 */
export const downloadClientInvoicePdf = (apiUrl, bookingId, bookingStatus) => {
  if (!isStatusAtOrAfter(bookingStatus, 'COMPLETED')) {
    return false;
  }

  window.open(`${apiUrl}/api/client/invoices/${bookingId}/pdf`, '_blank');
  return true;
};
