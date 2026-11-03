import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import NewBooking from './NewBooking';
import InteractiveMap from '@/components/InteractiveMap';

jest.mock('axios');
jest.mock('react-router-dom', () => ({ useParams: () => ({ lang: 'fr' }) }), { virtual: true });
jest.mock('@/components/InteractiveMap', () => jest.fn(() => null));
jest.mock('@/components/ui/calendar', () => ({ Calendar: () => null }));
jest.mock('date-fns/locale', () => ({ fr: {} }), { virtual: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it.each(['pickup', 'dropoff'])('sends the client %s address through the real autocomplete and booking hook', async (field) => {
  jest.useFakeTimers();
  axios.get.mockReset().mockResolvedValue({ data: [] });
  axios.post.mockReset().mockResolvedValue({ data: { features: [{
    properties: { name: 'Roissy' }, geometry: { coordinates: [2.52, 49] },
  }] } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<NewBooking />));
    const input = container.querySelector(`[data-testid="${field}-input"]`);
    expect(input.getAttribute('role')).toBe('combobox');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'roissy');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe('roissy');
    expect(axios.post).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/map\/search$/);
    expect(axios.post.mock.calls[0][1]).toEqual({ q: 'roissy' });
    expect(axios.post.mock.calls[0][2].signal.aborted).toBe(false);
    await act(async () => container.querySelector('[role="option"]').click());
    expect(input.value).toBe('Roissy');
    expect(InteractiveMap.mock.calls.at(-1)[0][field].position).toEqual([49, 2.52]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
  }
});
