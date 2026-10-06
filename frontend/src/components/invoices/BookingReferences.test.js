import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useInvoices, useDriverInvoices } from '@/hooks/useInvoices';
import { downloadInvoicePdf, downloadDriverDocPdf } from '@/utils/invoiceGenerator';
import AdminDocuments from '../../pages/admin/AdminDocuments';
import DriverInvoiceSection from '../../pages/driver/DriverInvoiceSection';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/hooks/useInvoices', () => ({
  useInvoices: jest.fn(),
  useDriverInvoices: jest.fn(),
}), { virtual: true });
jest.mock('@/utils/invoiceGenerator', () => ({
  downloadInvoicePdf: jest.fn(),
  downloadDriverDocPdf: jest.fn(),
}), { virtual: true });
jest.mock('@/utils/invoiceUtils', () => jest.requireActual('../../utils/invoiceUtils'), { virtual: true });
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('@/components/LogoDisplay', () => () => <div />, { virtual: true });

describe('Booking references in document views', () => {
  let container;
  let root;
  const bookingId = 'abcdef123456';

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const booking = {
      id: bookingId,
      booking_id: bookingId,
      client_name: 'Client Test',
      pickup_date: '2026-10-12',
      pickup_time: '09:30',
      pickup_address: 'Paris',
      dropoff_address: 'CDG',
      price_ttc: 80,
      driver_earning: 72,
    };
    useInvoices.mockReturnValue({
      bookings: [booking], loading: false, error: null,
      stats: { totalTtc: 80, totalCommission: 8, totalDriver: 72 },
    });
    useDriverInvoices.mockReturnValue({
      invoices: [booking], loading: false, error: null, totalEarned: 72,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it.each([
    ['admin', AdminDocuments, downloadInvoicePdf],
    ['driver', DriverInvoiceSection, downloadDriverDocPdf],
  ])('shows six uppercase characters on mobile and desktop in the %s view without changing download IDs',
    async (_role, Component, download) => {
      await act(async () => root.render(<Component />));

      const references = container.querySelectorAll('p.font-mono.text-xs, td.font-mono.text-xs');
      expect(Array.from(references, (element) => element.textContent)).toEqual(['ABCDEF', 'ABCDEF']);
      expect(container.textContent).not.toContain(bookingId);
      const downloadButton = Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent.includes('Bon de '));
      await act(async () => downloadButton.click());
      expect(download).toHaveBeenCalledWith('http://api.test', bookingId, 'order');
    });
});
