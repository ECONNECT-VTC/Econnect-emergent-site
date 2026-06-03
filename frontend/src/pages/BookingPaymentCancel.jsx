import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, WarningCircle } from '@phosphor-icons/react';

const BookingPaymentCancel = () => {
  const { lang = 'fr' } = useParams();

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-16 text-white">
      <div className="mx-auto max-w-2xl glass rounded-2xl p-8 md:p-10">
        <div className="mb-4 flex items-center gap-3 text-yellow-400">
          <WarningCircle size={34} weight="fill" />
          <h1 className="text-3xl font-bold font-['Cormorant_Garamond']">Paiement annulé</h1>
        </div>
        <p className="text-sm text-[#A1A1AA]">
          Le paiement n'a pas été finalisé. Vous pouvez reprendre votre réservation sans ressaisir les informations.
        </p>

        <div className="mt-8">
          <Link
            to={`/${lang}#reserver`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 font-semibold text-[#0A0A0A]"
            data-testid="booking-cancel-back-to-form"
          >
            <ArrowLeft size={16} />
            Revenir au formulaire
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BookingPaymentCancel;
