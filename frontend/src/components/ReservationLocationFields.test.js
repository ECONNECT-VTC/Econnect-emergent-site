import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReservationLocationFields from './ReservationLocationFields';
import InteractiveMap from './InteractiveMap';
import axios from 'axios';
import useBookingFormMap from '@/hooks/useBookingFormMap';

jest.mock('axios');
jest.mock('./InteractiveMap', () => jest.fn(() => <div data-testid="map" />));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it('shares both fields and the same InteractiveMap callbacks across admin and edit surfaces', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const map = {
    addresses: { pickup: null, dropoff: null }, activeField: 'pickup',
    changeAddress: jest.fn(), selectAddress: jest.fn(), setActiveField: jest.fn(), selectMapPosition: jest.fn(),
  };
  await act(async () => root.render(<ReservationLocationFields form={{ pickup_address: 'Paris', dropoff_address: 'CDG' }}
    map={map} idPrefix="admin-create" />));
  expect(container.querySelector('#admin-create-pickup').value).toBe('Paris');
  expect(container.querySelector('#admin-create-dropoff').value).toBe('CDG');
  const props = InteractiveMap.mock.calls.at(-1)[0];
  expect(props.onSelectPosition).toBe(map.selectMapPosition);
  expect(props.onActiveFieldChange).toBe(map.setActiveField);
  await act(async () => root.unmount());
});

function AdminFields() {
  const [form, setForm] = useState({ pickup_address: '', dropoff_address: '' });
  const map = useBookingFormMap(form, setForm);
  return <ReservationLocationFields form={form} map={map} idPrefix="admin-create" />;
}

it.each(['pickup', 'dropoff'])('runs the real admin %s autocomplete through the shared form hook and HTTP client', async (field) => {
  jest.useFakeTimers();
  axios.post.mockReset().mockResolvedValue({ data: { features: [{
    properties: { name: 'Roissy' }, geometry: { coordinates: [2.52, 49] },
  }] } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminFields />));
    const input = container.querySelector(`#admin-create-${field}`);
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
