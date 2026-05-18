import {
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
});
