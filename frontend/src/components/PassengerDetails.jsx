import { Input } from '@/components/ui/input';

export function passengerDetailsError(total, children, infants, babySeats, boosters) {
  const values = [total, children, infants, babySeats, boosters].map(Number);
  if ([total, children, infants, babySeats, boosters].some((value) => String(value).trim() === '')
    || values.some((value) => !Number.isInteger(value) || value < 0 || value > 7)
    || values[0] < 1) return 'Indiquez un nombre entier valide pour chaque champ de passagers.';
  if (values[1] + values[2] > values[0]) return 'Le nombre d’enfants et de bébés dépasse le nombre total de passagers.';
  if (values[4] > values[1] || values[3] + values[4] > values[1] + values[2]) {
    return 'Vérifiez les sièges bébé et rehausseurs demandés par rapport au nombre d’enfants et de bébés.';
  }
  return '';
}

export default function PassengerDetails({ prefix, total, childrenCount, infants, boosters, onChildrenChange, onInfantsChange, onBoostersChange }) {
  const fields = [
    ['children', 'Enfants (hors bébés)', childrenCount, onChildrenChange],
    ['infants', 'Bébés', infants, onInfantsChange],
    ['boosters', 'Rehausseurs nécessaires', boosters, onBoostersChange],
  ];
  const adults = Number(total) - Number(childrenCount) - Number(infants);
  return <>
    {fields.map(([id, label, value, onChange]) => (
      <div className="space-y-2" key={id}>
        <label htmlFor={`${prefix}-${id}`} className="text-sm text-[#A1A1AA]">{label}</label>
        <Input id={`${prefix}-${id}`} type="number" min="0" max="7" step="1" required
          value={value} onChange={(event) => onChange(event.target.value)} className="bg-[#1E1E1E] border-white/10" />
      </div>
    ))}
    <p className="text-sm text-[#A1A1AA]">Adultes : {adults >= 0 ? adults : '—'} (total des passagers moins enfants et bébés)</p>
  </>;
}
