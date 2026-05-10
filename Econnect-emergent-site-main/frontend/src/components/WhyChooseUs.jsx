import { motion } from 'framer-motion';
import { ShieldCheck, Clock, Star, Car } from '@phosphor-icons/react';
import { useLanguage } from '@/contexts/LanguageContext';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

const WhyChooseUs = () => {
  const { t } = useLanguage();

  const features = [
    {
      icon: Clock,
      titleKey: 'ponctualite',
      descKey: 'ponctualiteDesc',
    },
    {
      icon: ShieldCheck,
      titleKey: 'securite',
      descKey: 'securiteDesc',
    },
    {
      icon: Star,
      titleKey: 'excellence',
      descKey: 'excellenceDesc',
    },
    {
      icon: Car,
      titleKey: 'confort',
      descKey: 'confortDesc',
    },
  ];

  return (
    <section id="apropos" className="py-24 md:py-32 bg-[#0A0A0A]" data-testid="why-choose-us-section">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-[#D4AF37] text-sm tracking-[0.3em] uppercase">{t('pourquoiNousLabel')}</span>
          <h2 className="text-4xl md:text-5xl font-bold font-['Cormorant_Garamond'] mt-4 tracking-tight" data-testid="why-choose-us-title">
            {t('whyChooseTitle1')}
            <br />
            <span className="gold-text">{t('whyChooseTitle2')}</span>
          </h2>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="group p-8 rounded-2xl bg-[#141414] border border-white/5 hover:border-[#D4AF37]/30 transition-all duration-500 card-glow"
              data-testid={`feature-${index}`}
            >
              <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mb-6 group-hover:bg-[#D4AF37]/20 transition-colors duration-300">
                <feature.icon size={32} weight="light" className="text-[#D4AF37]" />
              </div>
              <h3 className="text-xl font-bold font-['Cormorant_Garamond'] mb-3">
                {t(feature.titleKey)}
              </h3>
              <p className="text-[#A1A1AA] text-sm leading-relaxed">
                {t(feature.descKey)}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default WhyChooseUs;
