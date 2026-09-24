import {
  downloadClientInvoicePdf,
  downloadDriverDocPdf,
  downloadDriverInvoicePdf,
  downloadInvoicePdf,
} from './invoiceGenerator';

describe('invoiceGenerator', () => {
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

  afterEach(() => {
    openSpy.mockClear();
  });

  afterAll(() => {
    openSpy.mockRestore();
  });

  it('opens the admin activity document route', () => {
    downloadInvoicePdf('https://api.example.com', 'booking-1', 'activity');

    expect(openSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/admin/invoices/booking-1/activity-pdf',
      '_blank'
    );
  });

  it('opens the admin quote route', () => {
    downloadInvoicePdf('https://api.example.com', 'booking-1', 'quote');

    expect(openSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/admin/quotes/booking-1/pdf',
      '_blank'
    );
  });

  it('falls back to the admin invoice route for unknown document types', () => {
    downloadInvoicePdf('https://api.example.com', 'booking-1', 'unknown');

    expect(openSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/admin/invoices/booking-1/pdf',
      '_blank'
    );
  });

  it('opens driver document routes, including activity statements', () => {
    downloadDriverDocPdf('https://api.example.com', 'booking-2', 'activity');

    expect(openSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/driver/invoices/booking-2/activity-pdf',
      '_blank'
    );
  });

  it('keeps the legacy driver invoice download helper intact', () => {
    downloadDriverInvoicePdf('https://api.example.com', 'booking-3');

    expect(openSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/driver/invoices/booking-3/pdf',
      '_blank'
    );
  });

  it('blocks client invoice downloads before the booking is completed', () => {
    expect(downloadClientInvoicePdf('https://api.example.com', 'booking-4', 'QUOTE_SENT')).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('opens the client invoice route after completion', () => {
    expect(downloadClientInvoicePdf('https://api.example.com', 'booking-5', 'COMPLETED')).toBe(true);

    expect(openSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/client/invoices/booking-5/pdf',
      '_blank'
    );
  });
});
