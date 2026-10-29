import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import InteractiveMap from './InteractiveMap';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
    MapContainer: jest.fn(({ children }) => React.createElement('div', null, children)),
    TileLayer: jest.fn(() => null),
    Marker: jest.fn(({ children }) => React.createElement('div', null, children)),
    Popup: ({ children }) => React.createElement('div', null, children),
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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
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
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=test%2Fkey%2Bwith%26special%3Dcharacters'
    );
    expect(tileProps.attribution).toContain('https://www.openstreetmap.org/copyright');
    expect(tileProps.attribution).toContain('https://carto.com/attributions');
    expect(MapContainer.mock.calls[0][0].center).toEqual([48.8566, 2.3522]);
    expect(MapContainer.mock.calls[0][0].zoom).toBe(11);
    expect(Marker.mock.calls[0][0].position).toEqual([48.8566, 2.3522]);
    expect(container.textContent).toContain('Econnect VTC - Paris');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([undefined, '', '   '])('reports an unavailable map for key %p without requesting tiles', async (key) => {
    if (key !== undefined) process.env.REACT_APP_CARTO_API_KEY = key;

    await act(async () => root.render(<InteractiveMap />));

    expect(container.querySelector('[role="alert"]').textContent).toContain(
      "la clé CARTO n'est pas configurée"
    );
    expect(MapContainer).not.toHaveBeenCalled();
    expect(TileLayer).not.toHaveBeenCalled();
  });
});
