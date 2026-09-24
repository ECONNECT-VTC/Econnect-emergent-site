import { WhatsappLogo } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { WHATSAPP_PHONE } from '@/config';

const WhatsAppButton = () => {
  const message = "Bonjour, je souhaite réserver un chauffeur VTC";
  const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;

  return (
    <motion.a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1, type: 'spring', stiffness: 200 }}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#050505]/78 shadow-[0_24px_50px_rgba(0,0,0,0.42)] backdrop-blur-md transition-transform duration-300 hover:scale-105 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:right-6 sm:h-[4.5rem] sm:w-[4.5rem] lg:bottom-[calc(2rem+env(safe-area-inset-bottom))] lg:right-8"
      data-testid="whatsapp-button"
      aria-label="Contacter via WhatsApp"
    >
      <span className="pulse-gold flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] shadow-[0_12px_28px_rgba(37,211,102,0.38)] sm:h-14 sm:w-14">
        <WhatsappLogo size={24} weight="fill" className="text-white sm:h-7 sm:w-7" />
      </span>
    </motion.a>
  );
};

export default WhatsAppButton;
