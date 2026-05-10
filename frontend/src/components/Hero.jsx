import { motion } from 'framer-motion';
import { CaretDown } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

const Hero = () => {
  const { t } = useLanguage();

  return (
    <section
      id="accueil"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      data-testid="hero-section"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src="https://images.pexels.com/photos/18370955/pexels-photo-18370955.jpeg"
          alt="Luxury car at night"
          className="w-full h-full object-cover"
        />
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-transparent to-[#0A0A0A]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/80 via-transparent to-[#0A0A0A]/60" />
        <div className="absolute inset-0 bg-[#0A0A0A]/40" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <span className="inline-block text-[#D4AF37] text-sm md:text-base tracking-[0.3em] uppercase mb-6">
            {t('serviceVtcPremium')}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-5xl md:text-7xl lg:text-8xl font-bold font-['Cormorant_Garamond'] tracking-tighter leading-none mb-6"
          data-testid="hero-title"
        >
          {t('heroTitle1')}
          <br />
          <span className="gold-text">{t('heroTitle2')}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-[#A1A1AA] text-lg md:text-xl max-w-2xl mx-auto mb-10"
          data-testid="hero-subtitle"
        >
          {t('heroSubtitle')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button
            asChild
            size="lg"
            className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold px-10 py-6 text-lg transition-all duration-300 hover:scale-105"
            data-testid="hero-cta-reserver"
          >
            <a href="#reserver">{t('reserverMaintenant')}</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 px-10 py-6 text-lg transition-all duration-300"
            data-testid="hero-cta-services"
          >
            <a href="#services">{t('nosServices')}</a>
          </Button>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <a href="#services" className="flex flex-col items-center text-[#A1A1AA] hover:text-[#D4AF37] transition-colors">
          <span className="text-xs tracking-widest uppercase mb-2">{t('decouvrir')}</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <CaretDown size={24} />
          </motion.div>
        </a>
      </motion.div>
    </section>
  );
};

export default Hero;
