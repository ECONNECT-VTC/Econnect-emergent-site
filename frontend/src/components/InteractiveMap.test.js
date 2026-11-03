import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import InteractiveMap from './InteractiveMap';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mockMap = {
  fitBounds: jest.fn(), setView: jest.fn(), invalidateSize: jest.fn(),
  getContainer: () => document.createElement('div'),
};
global.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
    MapContainer: jest.fn(({ children }) => React.createElement('div', null, children)),
    TileLayer: jest.fn(() => null),
    Marker: jest.fn(({ children }) => React.createElement('div', null, children)),
    Popup: ({ children }) => React.createElement('div', null, children),
    Polyline: jest.fn(() => null),
    useMap: () => mockMap,
    useMapEvents: jest.fn(),
  };
});

describe('InteractiveMap', () => {
  const originalKey = process.env.REACT_APP_CARTO_API_KEY;
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    MapContainer.mockImplementation(({ children }) => createElement('div', null, children));
    Marker.mockImplementation(({ children }) => createElement('div', null, children));
    delete process.env.REACT_APP_CARTO_API_KEY;
    delete window.__ECONNECT_CONFIG__;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete window.__ECONNECT_CONFIG__;
    if (originalKey === undefined) {
      delete process.env.REACT_APP_CARTO_API_KEY;
    } else {
      process.env.REACT_APP_CARTO_API_KEY = originalKey;
    }
  });

  it('uses the encoded environment key and preserves the map and both attributions', async () => {
    process.env.REACT_APP_CARTO_API_KEY = ' test/key+with&special=characters ';

    await act(async () => root.render(<InteractiveMap />));

    const tileProps = TileLayer.mock.calls[0][0];
    expect(tileProps.url).toBe(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=test%2Fkey%2Bwith%26special%3Dcharacters'
    );
    expect(tileProps.attribution).toContain('https://www.openstreetmap.org/copyright');
    expect(tileProps.attribution).toContain('https://carto.com/attributions');
    expect(MapContainer.mock.calls[0][0].center).toEqual([48.8566, 2.3522]);
    expect(MapContainer.mock.calls[0][0].zoom).toBe(11);
    expect(MapContainer.mock.calls[0][0].style.background).toBe('#F2EFE9');
    expect(Marker).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('prefers the runtime public key over the build-time key', async () => {
    process.env.REACT_APP_CARTO_API_KEY = 'build-key';
    window.__ECONNECT_CONFIG__ = { CARTO_API_KEY: ' runtime-key ' };

    await act(async () => root.render(<InteractiveMap />));

    expect(TileLayer.mock.calls[0][0].url).toBe('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=runtime-key');
    expect(container.textContent).not.toContain('runtime-key');
  });

  it('falls back to the build key when the runtime key is blank', async () => {
    process.env.REACT_APP_CARTO_API_KEY = 'build-key';
    window.__ECONNECT_CONFIG__ = { CARTO_API_KEY: '   ' };

    await act(async () => root.render(<InteractiveMap />));

    expect(TileLayer.mock.calls[0][0].url).toContain('?key=build-key');
    expect(container.textContent).not.toContain('build-key');
  });

  it.each([undefined, '', '   '])('does not request watermarked tiles when the key is %p', async (key) => {
    if (key !== undefined) process.env.REACT_APP_CARTO_API_KEY = key;

    await act(async () => root.render(<InteractiveMap />));

    expect(TileLayer).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Fond de carte non configuré');
  });

  it('renders both endpoints, fits the gold route and forwards map and field selections', async () => {
    const pickup = { label: 'Paris', position: [48.85, 2.35] };
    const dropoff = { label: 'CDG', position: [49.01, 2.55] };
    const route = { positions: [pickup.position, dropoff.position], distanceKm: 28.5, durationMinutes: 35 };
    const onSelectPosition = jest.fn();
    const onActiveFieldChange = jest.fn();
    await act(async () => root.render(
      <InteractiveMap {...{ pickup, dropoff, route, onSelectPosition, onActiveFieldChange }} />
    ));
    expect(Marker.mock.calls.map(([props]) => props.position)).toEqual([pickup.position, dropoff.position]);
    expect(Polyline.mock.calls[0][0].pathOptions.color).toBe('#D4AF37');
    expect(mockMap.fitBounds).toHaveBeenCalledWith(route.positions, { padding: [40, 40], maxZoom: 15 });
    expect(container.textContent).toContain('28.5 km');
    useMapEvents.mock.calls[0][0].click({ latlng: { lat: 48.9, lng: 2.4 } });
    expect(onSelectPosition).toHaveBeenCalledWith([48.9, 2.4]);
    await act(async () => container.querySelectorAll('button')[1].click());
    expect(onActiveFieldChange).toHaveBeenCalledWith('dropoff');
  });

  it('prevents modifying the route after leaving the address step', async () => {
    const onSelectPosition = jest.fn();
    await act(async () => root.render(<InteractiveMap editable={false} onSelectPosition={onSelectPosition} />));
    useMapEvents.mock.calls[0][0].click({ latlng: { lat: 48.9, lng: 2.4 } });
    expect(onSelectPosition).not.toHaveBeenCalled();
    expect(container.querySelector('button')).toBeNull();
  });

  it('reports unavailable background tiles without disabling address selection', async () => {
    process.env.REACT_APP_CARTO_API_KEY = 'test-key';
    await act(async () => root.render(<InteractiveMap onSelectPosition={jest.fn()} />));
    await act(async () => TileLayer.mock.calls[0][0].eventHandlers.tileerror());
    expect(container.querySelector('[role="alert"]').textContent).toContain('fond de carte est indisponible');
    expect(container.querySelector('button')).not.toBeNull();
  });
});
