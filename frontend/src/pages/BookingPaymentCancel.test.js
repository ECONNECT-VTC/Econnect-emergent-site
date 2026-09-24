import { act } from 'react';
import { createRoot } from 'react-dom/client';
import BookingPaymentCancel from './BookingPaymentCancel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockLink = jest.fn();

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: (props) => {
      mockLink(props);
      return React.createElement('a', props, props.children);
    },
    useParams: () => ({ lang: 'fr' }),
  };
}, { virtual: true });

describe('BookingPaymentCancel', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockLink.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('links back to booking form with cancel state', async () => {
    await act(async () => {
      root.render(<BookingPaymentCancel />);
    });

    expect(container.textContent).toContain('Paiement annulé');
    expect(mockLink).toHaveBeenCalledWith(expect.objectContaining({
      'data-testid': 'booking-cancel-back-to-form',
      to: { pathname: '/fr', hash: '#reserver' },
      state: { fromBookingCancel: true },
    }));
  });
});
