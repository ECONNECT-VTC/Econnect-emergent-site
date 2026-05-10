import { motion } from 'framer-motion';
import { Car } from '@phosphor-icons/react';
import { useLanguage } from '@/contexts/LanguageContext';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

const FleetSection = () => {
  const { t } = useLanguage();

  const gammes = [
    {
      nameKey: 'comfortClassique',
      descKey: 'comfortClassiqueDesc',
      price: '30\u20ac',
      image: 'https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg',
    },
    {
      nameKey: 'comfortPremium',
      descKey: 'comfortPremiumDesc',
      price: '55\u20ac',
      image: 'https://images.pexels.com/photos/3802510/pexels-photo-3802510.jpeg',
    },
    {
      nameKey: 'prestige',
      descKey: 'prestigeDesc',
      price: '90\u20ac',
      image: 'https://images.pexels.com/photos/1545743/pexels-photo-1545743.jpeg',
    },
    {
      nameKey: 'van',
      descKey: 'vanDesc',
      price: '70\u20ac',
      image: 'https://images.pexels.com/photos/15774577/pexels-photo-15774577.jpeg',
    },
  ];

  return (
    <section id="gammes" className="py-24 md:py-32 bg-[#141414]" data-testid="fleet-section">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-[#D4AF37] text-sm tracking-[0.3em] uppercase">{t('notreFlotte')}</span>
          <h2 className="text-4xl md:text-5xl font-bold font-['Cormorant_Garamond'] mt-4 tracking-tight" data-testid="fleet-title">
            {t('fleetTitle1')}
            <br />
            <span className="gold-text">{t('fleetTitle2')}</span>
          </h2>
        </motion.div>

        {/* Fleet Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {gammes.map((gamme, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="group rounded-2xl bg-[#1E1E1E] border border-white/5 hover:border-[#D4AF37]/30 transition-all duration-500 overflow-hidden card-glow"
              data-testid={`gamme-${index}`}
            >
              {/* Car image */}
              <div className="relative h-44 overflow-hidden">
                <img
                  src={gamme.image}
                  alt={t(gamme.nameKey)}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1E1E1E] to-transparent opacity-60" />
                <div className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                  <Car size={20} weight="light" className="text-[#D4AF37]" />
                </div>
              </div>

              {/* Card content */}
              <div className="p-6">
                <h3 className="text-lg font-bold font-['Cormorant_Garamond'] mb-2">
                  {t(gamme.nameKey)}
                </h3>
                <p className="text-[#A1A1AA] text-sm leading-relaxed mb-4">
                  {t(gamme.descKey)}
                </p>
                <span className="text-[#D4AF37] text-sm font-semibold">
                  {t('aPartirDe')} {gamme.price}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default FleetSection;
