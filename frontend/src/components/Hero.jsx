import { motion } from 'framer-motion';
import { CaretDown } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

const Hero = () => {
  const { t } = useLanguage();

  return (
    <section
      id="accueil"
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden pb-16 pt-28 sm:pb-20 sm:pt-32"
      data-testid="hero-section"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          /*src="https://images.pexels.com/photos/18370955/pexels-photo-18370955.jpeg"*/
          src="/photo/page_accueil.png"
          alt="Luxury car at night"
          className="w-full h-full object-cover"
        />
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-transparent to-[#0A0A0A]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/80 via-transparent to-[#0A0A0A]/60" />
        <div className="absolute inset-0 bg-[#0A0A0A]/40" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <span className="mb-5 inline-block text-xs uppercase tracking-[0.24em] text-[#D4AF37] sm:text-sm md:text-base">
            {t('serviceVtcPremium')}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mb-6 break-words text-4xl font-bold font-['Cormorant_Garamond'] leading-[0.95] tracking-tighter sm:text-5xl md:text-7xl lg:text-8xl"
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
          className="mx-auto mb-8 max-w-2xl text-base text-[#A1A1AA] sm:text-lg md:mb-10 md:text-xl"
          data-testid="hero-subtitle"
        >
          {t('heroSubtitle')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex flex-col justify-center gap-4 sm:flex-row"
        >
          <Button
            asChild
            size="lg"
            className="w-full bg-[#D4AF37] px-6 py-6 text-base font-semibold text-[#0A0A0A] transition-all duration-300 hover:bg-[#F0C74A] hover:scale-105 sm:w-auto sm:px-10 sm:text-lg"
            data-testid="hero-cta-reserver"
          >
            <a href="#reserver">{t('reserverMaintenant')}</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full border-[#D4AF37] px-6 py-6 text-base text-[#D4AF37] transition-all duration-300 hover:bg-[#D4AF37]/10 sm:w-auto sm:px-10 sm:text-lg"
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
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 sm:block"
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
