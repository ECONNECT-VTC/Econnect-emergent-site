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
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg hover:scale-110 transition-transform duration-300 pulse-gold"
      data-testid="whatsapp-button"
      aria-label="Contacter via WhatsApp"
    >
      <WhatsappLogo size={28} weight="fill" className="text-white" />
    </motion.a>
  );
};

export default WhatsAppButton;
