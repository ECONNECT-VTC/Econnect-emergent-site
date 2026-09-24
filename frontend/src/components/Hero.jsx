import { motion } from 'framer-motion';
import { CaretDown } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import getPublicAssetUrl from '@/lib/publicAsset';

const Hero = () => {
  const { t } = useLanguage();

  return (
    <section
      id="accueil"
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden pb-16 pt-28 sm:pb-20 sm:pt-32 lg:min-h-[105vh] lg:pb-24 lg:pt-40 xl:min-h-[108vh] xl:pt-44"
      data-testid="hero-section"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          /*src="https://images.pexels.com/photos/18370955/pexels-photo-18370955.jpeg"*/
          src={getPublicAssetUrl('/photo/page_accueil.png')}
          alt="Luxury car at night"
          className="hero-backdrop-image h-full w-full object-cover"
        />
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-transparent to-[#0A0A0A]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/80 via-transparent to-[#0A0A0A]/60" />
        <div className="absolute inset-0 bg-[#0A0A0A]/40" />
      </div>

      {/* Content */}
      <div className="landing-shell relative z-10 mx-auto w-full text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <span className="mb-6 inline-block text-sm uppercase tracking-[0.28em] text-[#D4AF37] md:text-[1rem] lg:mb-8">
            {t('serviceVtcPremium')}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mb-6 max-w-[12ch] break-words text-[clamp(3.15rem,8vw,7.25rem)] font-bold font-['Cormorant_Garamond'] leading-[0.9] tracking-[-0.02em] lg:mb-7"
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
          className="mx-auto mb-8 max-w-4xl text-base text-[#D4D4D8] sm:text-lg md:mb-10 md:text-xl lg:text-[1.35rem] lg:leading-relaxed"
          data-testid="hero-subtitle"
        >
          {t('heroSubtitle')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex flex-col justify-center gap-4 sm:flex-row sm:gap-5 lg:gap-6"
        >
          <Button
            asChild
            size="lg"
            className="w-full bg-[#D4AF37] px-7 py-6 text-lg font-semibold text-[#0A0A0A] transition-all duration-300 hover:bg-[#F0C74A] hover:scale-105 sm:w-auto sm:px-10 sm:text-xl lg:min-w-[15rem] lg:px-12 lg:py-7"
            data-testid="hero-cta-reserver"
          >
            <a href="#reserver">{t('reserverMaintenant')}</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full border-[#D4AF37] px-7 py-6 text-lg text-[#D4AF37] transition-all duration-300 hover:bg-[#D4AF37]/10 sm:w-auto sm:px-10 sm:text-xl lg:min-w-[15rem] lg:px-12 lg:py-7"
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
