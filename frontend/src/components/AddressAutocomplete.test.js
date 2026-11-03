import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AddressAutocomplete from './AddressAutocomplete';
import { searchAddresses } from '@/utils/bookingMap';

jest.mock('@/utils/bookingMap', () => ({
  ...jest.requireActual('../utils/bookingMap'),
  searchAddresses: jest.fn(),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const address = { label: 'Gare du Nord, Paris', position: [48.88, 2.35] };
let selected;

function Harness() {
  const [value, setValue] = useState('');
  const [selectedAddress, setSelectedAddress] = useState(null);
  return <AddressAutocomplete aria-label="Départ" value={value} selectedAddress={selectedAddress}
    onChange={(text) => { setValue(text); setSelectedAddress(null); }}
    onSelect={(result) => { selected = result; setSelectedAddress(result); setValue(result.label); }} />;
}

describe('address autocomplete', () => {
  let container;
  let root;
  const type = async (value) => {
    await act(async () => {
      const input = container.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const finishSearch = async () => {
    await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); });
  };
  beforeEach(async () => {
    jest.useFakeTimers();
    selected = null;
    searchAddresses.mockReset().mockResolvedValue([address]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it('debounces searches, selects by keyboard and allows editing without refocusing', async () => {
    await type('Ga');
    await finishSearch();
    expect(searchAddresses).not.toHaveBeenCalled();
    await type('Gare du Nord');
    await finishSearch();
    expect(searchAddresses).toHaveBeenCalledTimes(1);
    expect(selected).toBeNull();
    const input = container.querySelector('input');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(input.getAttribute('aria-activedescendant')).toBe(container.querySelector('[role="option"]').id);
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(selected).toEqual(address);
    expect(input.value).toBe(address.label);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    await type('Orly');
    await finishSearch();
    expect(searchAddresses).toHaveBeenCalledTimes(2);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('selects an address by clicking a suggestion', async () => {
    await type('Paris');
    await finishSearch();
    await act(async () => container.querySelector('[role="option"]').click());
    expect(selected).toEqual(address);
  });

  it('discards old suggestions after the input changes', async () => {
    let resolve;
    searchAddresses.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await type('Paris');
    await finishSearch();
    await type('Orly');
    await act(async () => resolve([address]));
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it('shows service errors and empty results without choosing an address', async () => {
    searchAddresses.mockRejectedValueOnce(new Error('Network'));
    await type('Paris');
    await finishSearch();
    expect(container.querySelector('[role="alert"]').textContent).toContain('indisponible');
    searchAddresses.mockResolvedValueOnce([]);
    await type('Inconnue');
    await finishSearch();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Aucune adresse');
    expect(selected).toBeNull();
  });

  it('distinguishes a 404 API error from a successful search with no results', async () => {
    searchAddresses.mockRejectedValueOnce({ response: { status: 404, data: { detail: 'Not Found' } } });
    await type('roissy');
    await finishSearch();
    expect(container.querySelector('[role="alert"]').textContent).toContain('API cartographique est introuvable');
    expect(container.querySelector('input').value).toBe('roissy');
    expect(selected).toBeNull();
    searchAddresses.mockResolvedValueOnce([]);
    await type('adresse inconnue');
    await finishSearch();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Aucune adresse trouvée');
  });

  it('cancels the previous search signal on further input but executes the latest debounce', async () => {
    await type('roi');
    await finishSearch();
    const previousSignal = searchAddresses.mock.calls[0][1];
    await type('roissy');
    expect(previousSignal.aborted).toBe(true);
    await finishSearch();
    expect(searchAddresses.mock.calls.at(-1)[0]).toBe('roissy');
    expect(searchAddresses.mock.calls.at(-1)[1].aborted).toBe(false);
  });
});
