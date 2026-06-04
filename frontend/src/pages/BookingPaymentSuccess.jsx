import { useEffect, useState } from 'react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, CircleNotch, EnvelopeSimple, Receipt, WarningCircle } from '@phosphor-icons/react';
import API_URL from '@/config';
import { clearBookingCheckoutDraft, confirmBookingPayment } from '@/utils/bookingCheckout';

const BookingPaymentSuccess = () => {
  const { lang = 'fr' } = useParams();
  const [searchParams] = useSearchParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [verificationState, setVerificationState] = useState('loading');
  const bookingId = searchParams.get('booking_id');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    clearBookingCheckoutDraft();
  }, []);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId) {
        setError('Identifiant de réservation introuvable.');
        setVerificationState('error');
        return;
      }

      try {
        if (sessionId) {
          const response = await confirmBookingPayment(bookingId, sessionId);
          setBooking(response.booking);
          setVerificationState(response.verified ? 'success' : 'pending');
          if (!response.verified) {
            setError('Votre paiement est encore en cours de vérification. La réservation reste visible dans votre espace client.');
          }
          return;
        }

        const response = await axios.get(`${API_URL}/api/bookings/${bookingId}`, { withCredentials: true });
        setBooking(response.data);
        setVerificationState(response.data?.payment_status === 'paid' ? 'success' : 'pending');
      } catch (err) {
        setError(err?.response?.data?.detail || 'Réservation introuvable.');
        setVerificationState('error');
      }
    };
    fetchBooking();
  }, [bookingId, sessionId]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl glass rounded-2xl p-8 md:p-10">
        <div className={`mb-6 flex items-center gap-3 ${
          verificationState === 'error' ? 'text-red-300' : verificationState === 'pending' ? 'text-yellow-300' : 'text-green-400'
        }`}>
          {verificationState === 'loading' && <CircleNotch size={34} className="animate-spin" />}
          {verificationState === 'pending' && <WarningCircle size={34} weight="fill" />}
          {verificationState === 'success' && <CheckCircle size={36} weight="fill" />}
          {verificationState === 'error' && <WarningCircle size={34} weight="fill" />}
          <h1 className="text-3xl font-bold font-['Cormorant_Garamond']">
            {verificationState === 'loading' && 'Vérification du paiement'}
            {verificationState === 'pending' && 'Paiement en cours de vérification'}
            {verificationState === 'success' && 'Paiement confirmé'}
            {verificationState === 'error' && 'Impossible de confirmer le paiement'}
          </h1>
        </div>

        {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

        {booking && (
          <div className="space-y-2 rounded-xl border border-[#D4AF37]/20 bg-[#1E1E1E] p-5 text-sm text-[#C7B588]">
            <p><span className="text-[#A1A1AA]">Réservation :</span> #{booking.id}</p>
            <p><span className="text-[#A1A1AA]">Trajet :</span> {booking.pickup_address} → {booking.dropoff_address}</p>
            <p><span className="text-[#A1A1AA]">Date :</span> {booking.pickup_date} à {booking.pickup_time}</p>
            <p><span className="text-[#A1A1AA]">Montant payé :</span> {Number(booking.paid_amount ?? booking.estimated_price ?? 0).toFixed(2)} €</p>
            <p><span className="text-[#A1A1AA]">Paiement :</span> {booking.payment_status === 'paid' ? 'Payé' : booking.payment_status || 'En cours de vérification'}</p>
          </div>
        )}

        <div className="mt-6 space-y-3 text-sm text-[#A1A1AA]">
          <p className="flex items-center gap-2"><EnvelopeSimple size={16} className="text-[#D4AF37]" /> Un email de confirmation vous sera envoyé dès validation définitive du paiement.</p>
          <p className="flex items-center gap-2"><Receipt size={16} className="text-[#D4AF37]" /> Votre réservation apparaît dans votre espace client et devient visible côté admin dès confirmation.</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to={`/${lang}/client/bookings`}
            className="rounded-lg bg-[#D4AF37] px-4 py-2 font-semibold text-[#0A0A0A]"
            data-testid="booking-success-my-bookings"
          >
            Voir mes réservations
          </Link>
          <Link
            to={`/${lang}`}
            className="rounded-lg border border-[#D4AF37]/50 px-4 py-2 text-[#D4AF37]"
            data-testid="booking-success-home"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BookingPaymentSuccess;
