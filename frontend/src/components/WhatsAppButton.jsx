import { WhatsappLogo } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

const WhatsAppButton = () => {
  const message = "Bonjour, je souhaite réserver un chauffeur VTC";
  const whatsappUrl = `https://wa.me/33XXXXXXXXX?text=${encodeURIComponent(message)}`;

  return (
    <motion.a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1, type: 'spring', stiffness: 200 }}
      className="pulse-gold fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform duration-300 hover:scale-110 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:right-6 sm:h-14 sm:w-14"
      data-testid="whatsapp-button"
      aria-label="Contacter via WhatsApp"
    >
      <WhatsappLogo size={24} weight="fill" className="text-white sm:h-7 sm:w-7" />
    </motion.a>
  );
};

export default WhatsAppButton;
