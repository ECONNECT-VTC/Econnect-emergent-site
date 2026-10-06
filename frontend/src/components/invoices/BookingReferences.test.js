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
  const bookingId = '  abcdef123456  ';

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const booking = {
      id: bookingId,
      booking_id: bookingId,
      client_name: 'Client Test',
      driver_name: 'Chauffeur Exemple',
      created_at: '2026-10-12T09:30:00Z',
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
      const documentsButton = Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent.includes('Consulter les documents'));
      await act(async () => documentsButton.click());
      const desktopOrder = Array.from(container.querySelectorAll('table button'))
        .find((button) => button.textContent.includes('Bon de '));
      await act(async () => desktopOrder.click());
      expect(download).toHaveBeenLastCalledWith('http://api.test', bookingId, 'order');
    });

  describe.each([
    ['admin', AdminDocuments],
    ['driver', DriverInvoiceSection],
  ])('%s search', (_role, Component) => {
    it.each([
      ['a', true],
      ['aBc', true],
      ['ABCDEF', true],
      ['bcd', false],
      ['123456', false],
      ['abcdef1', false],
      ['CLIENT', true],
      ['ient Te', true],
      ['PARIS', true],
      ['cdg', true],
      ['absent', false],
      ['', true],
    ])('searches %p with visible match %p', async (search, matches) => {
      await act(async () => root.render(<Component />));
      const input = container.querySelector('input[type="text"]');
      expect(input.placeholder).toContain('numéro');
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, search);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const references = container.querySelectorAll('p.font-mono.text-xs, td.font-mono.text-xs');
      expect(Array.from(references, (element) => element.textContent)).toEqual(matches ? ['ABCDEF', 'ABCDEF'] : []);
    });
  });

  it('preserves admin chauffeur-name search', async () => {
    await act(async () => root.render(<AdminDocuments />));
    const input = container.querySelector('input[type="text"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'EXEMPLE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelectorAll('p.font-mono.text-xs, td.font-mono.text-xs')).toHaveLength(2);
  });
});
