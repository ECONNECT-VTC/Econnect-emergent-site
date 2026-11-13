import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import ChargeDraftEditor from './ChargeDraftEditor';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('./SupplementaryInvoices', () => () => null);

describe('admin charge draft', () => {
  let container;
  let root;
  const button = (text) => [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  const field = (label) => [...container.querySelectorAll('label')].find((item) => item.textContent.startsWith(label)).querySelector('input');
  const change = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockReset();
    axios.put.mockReset();
    axios.get.mockResolvedValue({ data: { revision: 0, lines: [] } });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it('saves explicitly priced lines as a draft without issuing a charge', async () => {
    await act(async () => root.render(<ChargeDraftEditor bookingId="one" />));
    await act(async () => button('Préparer des frais').click());
    expect(container.textContent).toContain('ne sont pas encore facturées');
    await act(async () => button('Ajouter un frais').click());
    await act(async () => {
      change(field('Libellé'), 'Attente');
      change(field('Quantité'), '2');
      change(field('Prix unitaire'), '10.00');
      change(field('Taux de TVA'), '20');
    });
    axios.put.mockResolvedValue({ data: { revision: 1, lines: [{
      description: 'Attente', quantity: '2', unit_price_ttc: '10.00',
      tax_treatment: 'vat', vat_percent: '20', tax_reason: null,
    }] } });
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(axios.put).toHaveBeenCalledWith('http://api.test/api/admin/bookings/one/charge-draft', {
      revision: 0, lines: [{ description: 'Attente', quantity: '2', unit_price_ttc: '10.00', tax_treatment: 'vat', vat_percent: '20', tax_reason: null }],
    }, expect.objectContaining({ withCredentials: true }));
    expect(container.textContent).toContain('aucun frais facturé');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('retains local edits on conflict and asks before discarding them', async () => {
    await act(async () => root.render(<ChargeDraftEditor bookingId="one" />));
    await act(async () => button('Préparer des frais').click());
    await act(async () => button('Ajouter un frais').click());
    await act(async () => change(field('Libellé'), 'Dégradation'));
    axios.put.mockRejectedValue({ response: { status: 409, data: { detail: 'Brouillon modifié' } } });
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]').textContent).toContain('Brouillon modifié');
    expect(field('Libellé').value).toBe('Dégradation');
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => button('Fermer').click());
    expect(field('Libellé').value).toBe('Dégradation');
    confirm.mockRestore();
  });
});
