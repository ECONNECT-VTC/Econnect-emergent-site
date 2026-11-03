import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCartoApiKey } from '../config';

const CARTO_TILES_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

const createMarker = (label, color) => L.divIcon({
  className: '',
  html: `<div style="background:${color};color:#0A0A0A;border:2px solid #fff;border-radius:50%;width:32px;height:32px;display:grid;place-items:center;font-weight:700;box-shadow:0 3px 12px #000">${label}</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});
const pickupIcon = createMarker('D', '#D4AF37');
const dropoffIcon = createMarker('A', '#F3D67A');

const MapInteraction = ({ pickup, dropoff, route, onSelectPosition }) => {
  const map = useMap();
  useMapEvents({
    click: ({ latlng }) => onSelectPosition?.([latlng.lat, latlng.lng]),
  });
  useEffect(() => {
    const positions = route?.positions || [pickup?.position, dropoff?.position].filter(Boolean);
    if (positions.length > 1) map.fitBounds(positions, { padding: [40, 40], maxZoom: 15 });
    else if (positions.length === 1) map.setView(positions[0], 15);
    else map.setView([48.8566, 2.3522], 11);
  }, [map, pickup, dropoff, route]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
};

const InteractiveMap = ({
  pickup, dropoff, route, activeField = 'pickup', onActiveFieldChange, onSelectPosition,
  loading = false, error = '', editable = true,
}) => {
  const [tileError, setTileError] = useState(false);
  // CARTO serves "API KEY REQUIRED" tiles without a key, so tiles are only requested with one.
  const cartoApiKey = getCartoApiKey();
  // Paris center coordinates
  const parisPosition = [48.8566, 2.3522];

  return (
    <div className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-[#D4AF37]/30 bg-[#0A0A0A]" data-testid="interactive-map">
      {onSelectPosition && editable && (
        <div className="p-4 space-y-3 text-sm text-[#C7B588]">
          <p>Choisissez une adresse proposée ou cliquez sur la carte.</p>
          <div className="flex gap-2" role="group" aria-label="Adresse à sélectionner sur la carte">
            {[['pickup', 'Départ'], ['dropoff', 'Arrivée']].map(([field, label]) => (
              <button key={field} type="button" aria-pressed={activeField === field}
                onClick={() => onActiveFieldChange?.(field)}
                className={`rounded-full border border-[#D4AF37]/50 px-4 py-2 ${activeField === field ? 'bg-[#D4AF37] text-black' : 'text-[#D4AF37]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="relative flex-1 min-h-[26.25rem] md:min-h-[31.25rem] lg:min-h-[42.5rem]">
        <MapContainer
          center={parisPosition}
          zoom={11}
          style={{ height: '100%', width: '100%', position: 'absolute', background: '#F2EFE9' }}
          zoomControl={true}
        >
          {cartoApiKey && (
            <TileLayer
              eventHandlers={{ tileerror: () => setTileError(true), tileload: () => setTileError(false) }}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url={`${CARTO_TILES_URL}?key=${encodeURIComponent(cartoApiKey)}`}
            />
          )}
          <MapInteraction pickup={pickup} dropoff={dropoff} route={route} onSelectPosition={editable ? onSelectPosition : undefined} />
          {[[pickup, pickupIcon, 'Départ'], [dropoff, dropoffIcon, 'Arrivée']].map(([address, icon, label]) => address && (
            <Marker key={label} position={address.position} icon={icon}>
              <Popup><strong>{label}</strong><br />{address.label}</Popup>
            </Marker>
          ))}
          {route && <Polyline positions={route.positions} pathOptions={{ color: '#D4AF37', weight: 5, opacity: 0.9 }} />}
        </MapContainer>
      </div>
      <div className="p-4 text-sm text-[#F3D67A]" aria-live="polite">
        {!cartoApiKey && <p role="alert" className="mb-2 text-amber-300">Fond de carte non configuré. La recherche d’adresses, les marqueurs et l’itinéraire restent utilisables.</p>}
        {tileError && <p role="alert" className="mb-2 text-amber-300">Le fond de carte est indisponible. La recherche d’adresses reste utilisable.</p>}
        {loading ? <p role="status">Localisation et calcul de l’itinéraire…</p>
          : route ? <p>{route.distanceKm} km · environ {route.durationMinutes} min (hors trafic)</p>
            : <p>Sélectionnez le départ et l’arrivée pour afficher votre itinéraire.</p>}
        {error && <p role="alert" className="mt-2 text-amber-300">{error}</p>}
      </div>
    </div>
  );
};

export default InteractiveMap;
