import AddressAutocomplete from './AddressAutocomplete';
import InteractiveMap from './InteractiveMap';
import { Label } from '@/components/ui/label';

export default function ReservationLocationFields({ form, map, idPrefix }) {
  return (
    <div className="space-y-4">
      {[['pickup', 'Adresse de départ'], ['dropoff', 'Adresse d’arrivée']].map(([field, label]) => (
        <div key={field} className="space-y-2">
          <Label htmlFor={`${idPrefix}-${field}`} className="text-[#A1A1AA]">{label}</Label>
          <AddressAutocomplete
            id={`${idPrefix}-${field}`}
            value={form[`${field}_address`] || ''}
            selectedAddress={map.addresses[field]}
            onChange={(value) => map.changeAddress(field, value)}
            onSelect={(address) => map.selectAddress(field, address)}
            onFocus={() => map.setActiveField(field)}
            placeholder="Adresse et ville"
            className="bg-[#1E1E1E] border-white/10"
          />
        </div>
      ))}
      <InteractiveMap
        pickup={map.addresses.pickup} dropoff={map.addresses.dropoff}
        route={map.route} activeField={map.activeField}
        onActiveFieldChange={map.setActiveField} onSelectPosition={map.selectMapPosition}
        loading={map.loading} error={map.error}
      />
    </div>
  );
}
