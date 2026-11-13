export default function PassengerSummary({ booking }) {
  if (booking.passenger_count == null) return null;
  return <div className="mt-3 text-sm text-[#A1A1AA]">
    <p>Passagers : {booking.passenger_count}
      {booking.adult_count != null && ` (${booking.adult_count} adulte(s), ${booking.child_count} enfant(s), ${booking.infant_count} bébé(s))`}</p>
    <p>Sièges bébé : {booking.baby_seat_count ?? 0}
      {booking.adult_count != null && ` · Rehausseurs : ${booking.booster_seat_count ?? 0}`}</p>
  </div>;
}
