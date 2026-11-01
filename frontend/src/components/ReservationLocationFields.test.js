import { act } from 'react';
import { createRoot } from 'react-dom/client';
import ReservationLocationFields from './ReservationLocationFields';
import InteractiveMap from './InteractiveMap';

jest.mock('./InteractiveMap', () => jest.fn(() => <div data-testid="map" />));
jest.mock('./AddressAutocomplete', () => (props) => <input id={props.id} value={props.value}
  onChange={(event) => props.onChange(event.target.value)} onFocus={props.onFocus} />);
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
