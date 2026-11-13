import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import SupplementaryInvoices from './SupplementaryInvoices';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });

describe('supplementary invoices', () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
  let container;
  let root;
  let capabilities;
  let state;
  let onChanged;
  const url = 'http://api.test/api/admin/bookings/one/supplementary-invoices';
  const button = (text) => [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  const field = (label) => [...container.querySelectorAll('label')].find((item) => item.textContent.startsWith(label)).querySelector('input, select');
  const change = (input, value) => {
    const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  const render = async (props = {}) => {
    await act(async () => root.render(<SupplementaryInvoices
      bookingId="one" revision={1} hasLines dirty={false} onChanged={onChanged} {...props} />));
  };
  const fillIssue = async () => {
    await act(async () => {
      change(field('Nom de facturation'), 'Client');
      change(field('Adresse de facturation'), 'Lyon');
      change(field('Échéance'), '2026-12-13');
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onChanged = jest.fn().mockResolvedValue(undefined);
    capabilities = { issuance_available: true, transactions: 'available', enabled: true };
    state = { revision: 1, invoices: [] };
    axios.get.mockImplementation((path) => Promise.resolve({ data: path.endsWith('billing-capabilities') ? capabilities : state }));
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(window, 'crypto', {
      configurable: true, value: { randomUUID: jest.fn().mockReturnValue('9b3b9297-0694-4f3d-b8bd-d6a5a27e4dad') },
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.restoreAllMocks();
    if (originalCrypto) Object.defineProperty(window, 'crypto', originalCrypto);
    else delete window.crypto;
  });

  it('displays the safe capability result and keeps issuance unavailable by default', async () => {
    capabilities = { issuance_available: false, reason: 'Transactions MongoDB non confirmées : émission désactivée.' };
    await render();
    expect(container.textContent).toContain('Transactions MongoDB non confirmées');
    expect(container.textContent).toContain('Ne pas activer en production');
    expect(button('Émettre la facture complémentaire')).toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('requires saved synchronized lines before issuance', async () => {
    await render({ dirty: true });
    expect(button('Émettre la facture complémentaire').disabled).toBe(true);
    await render({ hasLines: false });
    expect(button('Émettre la facture complémentaire').disabled).toBe(true);
    state = { revision: 2, invoices: [] };
    await act(async () => button('Recharger les factures complémentaires').click());
    expect(button('Émettre la facture complémentaire').disabled).toBe(true);
  });

  it('retries an uncertain issuance with exactly the same request and billing snapshot', async () => {
    await render();
    await fillIssue();
    axios.post.mockRejectedValueOnce(new Error('Network Error'));
    await act(async () => button('Émettre la facture complémentaire').click());
    const original = axios.post.mock.calls[0];
    expect(original[0]).toBe(url);
    expect(original[1]).toEqual({
      revision: 1, request_id: expect.any(String), due_date: '2026-12-13', client: { name: 'Client', address: 'Lyon' },
    });
    expect(container.querySelector('[role="alert"]').textContent).toContain('Erreur réseau');
    expect(field('Nom de facturation').closest('fieldset').disabled).toBe(true);
    axios.post.mockResolvedValueOnce({ data: { id: 'invoice', invoice_number: '000002' } });
    await act(async () => button('Réessayer la même émission').click());
    expect(axios.post.mock.calls[1]).toEqual(original);
    expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('000002 émise et archivée');
  });

  it('does not issue if the administrator cancels confirmation', async () => {
    await render();
    await fillIssue();
    window.confirm.mockReturnValue(false);
    await act(async () => button('Émettre la facture complémentaire').click());
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('records exact cents only against the selected supplementary invoice and safely retries', async () => {
    state.invoices = [{
      id: 'invoice', invoice_number: '000002', original_invoice_number: '000001',
      amount_ttc_cents: 2000, paid_cents: 0, commission_cents: 200, driver_cents: 1800, admin_retained_cents: 200,
    }];
    await render();
    await act(async () => {
      change(field('Facture à encaisser'), 'invoice');
      change(field('Montant déjà reçu'), '7,01');
    });
    axios.post.mockRejectedValueOnce({ response: { status: 503, data: { detail: 'Encaissement non confirmé' } } });
    await act(async () => button('Enregistrer cet encaissement').click());
    const original = axios.post.mock.calls[0];
    expect(original[0]).toBe(`${url}/invoice/payments`);
    expect(original[1]).toEqual({ revision: 1, request_id: expect.any(String), amount_cents: 701 });
    expect(container.querySelector('[role="alert"]').textContent).toContain('Encaissement non confirmé');
    axios.post.mockResolvedValueOnce({ data: { paid_cents: 701 } });
    await act(async () => button('Réessayer le même encaissement').click());
    expect(axios.post.mock.calls[1]).toEqual(original);
    expect(container.textContent).toContain('Aucun débit bancaire déclenché');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('surfaces loading failures without enabling financial actions', async () => {
    axios.get.mockRejectedValueOnce(new Error('API indisponible'));
    await render();
    expect(container.querySelector('[role="alert"]').textContent).toContain('API indisponible');
    expect(button('Émettre la facture complémentaire')).toBeUndefined();
  });
});
