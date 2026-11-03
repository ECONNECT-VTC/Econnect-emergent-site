import { useEffect, useId, useState } from 'react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { mapErrorMessage, searchAddresses, traceBookingMap } from '@/utils/bookingMap';

export default function AddressAutocomplete({ value, onChange, onSelect, onFocus, selectedAddress, ...props }) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState([]);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    traceBookingMap('value received', { length: value.trim().length, focused, selected: selectedAddress?.label === value });
    setSuggestions([]);
    setActiveIndex(-1);
    setError('');
    setLoading(false);
    if (!focused || value.trim().length < 3 || selectedAddress?.label === value) return;
    const controller = new AbortController();
    traceBookingMap('debounce scheduled', { delay: 400 });
    const timer = setTimeout(async () => {
      traceBookingMap('debounce executed', { length: value.trim().length });
      setLoading(true);
      try {
        const results = await searchAddresses(value.trim(), controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(results);
        if (!results.length) setError('Aucune adresse trouvée. Précisez la ville ou choisissez sur la carte.');
      } catch (err) {
        traceBookingMap('search failed or cancelled', { aborted: controller.signal.aborted, status: err.response?.status });
        if (!controller.signal.aborted && !axios.isCancel(err)) {
          setError(mapErrorMessage(err, 'Recherche d’adresses indisponible. Réessayez ou choisissez sur la carte.'));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      traceBookingMap('debounce cleanup', { aborted: true });
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, focused, selectedAddress]);

  const choose = (address) => {
    onSelect(address);
    setSuggestions([]);
    setFocused(false);
  };
  const expanded = focused && suggestions.length > 0;

  return (
    <div>
      <Input
        {...props}
        value={value}
        onChange={(event) => {
          traceBookingMap('onChange', { length: event.target.value.length });
          setFocused(true);
          onChange(event.target.value);
        }}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        maxLength={200}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setFocused(false); return; }
          if (!expanded) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => event.key === 'ArrowDown'
              ? (index + 1) % suggestions.length
              : (index - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(suggestions[activeIndex < 0 ? 0 : activeIndex]);
          }
        }}
      />
      {expanded && (
        <ul id={listId} role="listbox" className="mt-2 rounded-lg border border-[#D4AF37]/30 bg-[#141414] p-1 text-sm text-white">
          {suggestions.map((address, index) => (
            <li
              key={`${address.label}-${address.position.join(',')}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`rounded px-3 py-2 cursor-pointer hover:bg-[#D4AF37]/20 ${index === activeIndex ? 'bg-[#D4AF37]/20' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(address)}
            >
              {address.label}
            </li>
          ))}
        </ul>
      )}
      {focused && loading && <p role="status" className="mt-2 text-xs text-[#C7B588]">Recherche d’adresses…</p>}
      {focused && error && <p role="alert" className="mt-2 text-xs text-amber-300">{error}</p>}
      {value && selectedAddress?.label !== value && (
        <p className="mt-2 text-xs text-[#C7B588]">Choisissez une proposition ou un point sur la carte pour valider l’adresse.</p>
      )}
    </div>
  );
}
