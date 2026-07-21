import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('axios');

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    useParams: () => ({ lang: 'fr' }),
    useSearchParams: () => [new URLSearchParams()],
  };
}, { virtual: true });

jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('@/components/BookingComments', () => () => null, { virtual: true });
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}), { virtual: true });
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}), { virtual: true });
jest.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}), { virtual: true });

const mockDownloadClientInvoicePdf = jest.fn();
jest.mock('@/utils/invoiceGenerator', () => ({
  downloadClientInvoicePdf: (...args) => mockDownloadClientInvoicePdf(...args),
}), { virtual: true });

const ClientBookings = require('./ClientBookings').default;

describe('ClientBookings invoice visibility', () => {
  let container;
  let root;

  const renderWithBookings = async (bookings) => {
    axios.get.mockResolvedValueOnce({ data: bookings });

    await act(async () => {
      root.render(<ClientBookings />);
    });

    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    axios.get.mockReset();
    mockDownloadClientInvoicePdf.mockReset();
  });

  it('does not render the invoice download button before completion', async () => {
    await renderWithBookings([{
      id: 'booking-1',
      pickup_date: '21/07/2026',
      pickup_time: '10:30',
      pickup_address: 'Paris',
      dropoff_address: 'Lyon',
      status: 'QUOTE_ACCEPTED',
      payment_status: 'pending',
      driver_name: 'Chauffeur Test',
    }]);

    expect(container.textContent).not.toContain('Télécharger ma facture');
  });

  it('renders the invoice download button after completion and passes the booking status to the helper', async () => {
    await renderWithBookings([{
      id: 'booking-2',
      pickup_date: '21/07/2026',
      pickup_time: '10:30',
      pickup_address: 'Paris',
      dropoff_address: 'Lyon',
      status: 'COMPLETED',
      payment_status: 'paid',
      driver_name: 'Chauffeur Test',
    }]);

    expect(container.textContent).toContain('Télécharger ma facture');

    const invoiceButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Télécharger ma facture'));

    expect(invoiceButton).toBeTruthy();

    await act(async () => {
      invoiceButton.click();
    });

    expect(mockDownloadClientInvoicePdf).toHaveBeenCalledWith('http://api.test', 'booking-2', 'COMPLETED');
  });
});
