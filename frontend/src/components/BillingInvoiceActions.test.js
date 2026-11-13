import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import BillingInvoiceActions from './BillingInvoiceActions';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });

describe('administrative billing actions', () => {
  let container;
  let root;
  let refresh;
  const originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
  const invoice = { id: 'invoice', invoice_number: '000002', payments: [] };
  const button = (text) => [...container.querySelectorAll('button')].find((item) => item.textContent.includes(text));
  const change = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const render = async (item = invoice) => {
    await act(async () => root.render(<BillingInvoiceActions bookingId="booking" invoice={item} revision={4} onChanged={refresh} />));
  };
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    refresh = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'crypto', { configurable: true, value: {
      randomUUID: () => '9b3b9297-0694-4f3d-b8bd-d6a5a27e4dad',
    } });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    axios.post.mockResolvedValue({ data: {} });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.restoreAllMocks();
    if (originalCrypto) Object.defineProperty(window, 'crypto', originalCrypto);
    else delete window.crypto;
  });

  it('issues a distinct full credit with a reason, revision and retry identifier', async () => {
    await render();
    await act(async () => change(container.querySelector('input'), 'Frais corrigés'));
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/invoice/credit'),
      { revision: 4, request_id: expect.any(String), reason: 'Frais corrigés' },
      expect.objectContaining({ withCredentials: true }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls.some((call) => call[0].includes('refund'))).toBe(false);
  });

  it('requires explicit confirmation to record a manual refund without suggesting a bank debit', async () => {
    await render({ ...invoice, credit: { invoice_number: '000004' }, payments: [{
      request_id: 'receipt', amount_cents: 701,
    }] });
    window.confirm.mockReturnValue(false);
    await act(async () => button('Enregistrer le remboursement déjà effectué').click());
    expect(axios.post).not.toHaveBeenCalled();
    window.confirm.mockReturnValue(true);
    await act(async () => button('Enregistrer le remboursement déjà effectué').click());
    expect(axios.post.mock.calls[0][0]).toContain('/refund/receipt');
    expect(window.confirm.mock.calls[0][0]).toContain('Aucun virement');
  });

  it('blocks resending an uncertain email and requires reconciliation evidence', async () => {
    await render({ ...invoice, email: { status: 'unknown' } });
    expect(button('Envoyer la facture').disabled).toBe(true);
    expect(button('confirmer non envoyé').disabled).toBe(true);
    const input = [...container.querySelectorAll('label')].find((label) => label.textContent.includes('vérification Brevo')).querySelector('input');
    await act(async () => change(input, 'Brevo vérifié : aucun envoi'));
    await act(async () => button('confirmer non envoyé').click());
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/email/invoice/resolve'),
      { sent: false, evidence: 'Brevo vérifié : aucun envoi' }, expect.any(Object),
    );
    expect(axios.post.mock.calls.some((call) => call[0].endsWith('/email/invoice'))).toBe(false);
  });

  it('surfaces provider errors without claiming completion', async () => {
    await render();
    axios.post.mockRejectedValue({ response: { status: 502, data: { detail: 'Envoi non confirmé' } } });
    await act(async () => button('Envoyer la facture').click());
    expect(container.querySelector('[role="alert"]').textContent).toContain('Envoi non confirmé');
    expect(refresh).not.toHaveBeenCalled();
  });
});
