import { motion } from 'framer-motion';
import { Car, Clock, Airplane, Buildings } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

const Services = () => {
  const { t } = useLanguage();

  const services = [
    {
      id: 'trajets',
      titleKey: 'trajetsPonctuels',
      subtitleKey: 'trajetsPonctuelsSubtitle',
      descKey: 'trajetsPonctuelsDesc',
      icon: Car,
      image: 'https://images.pexels.com/photos/15774577/pexels-photo-15774577.jpeg',
      colSpan: 'md:col-span-6',
      rowSpan: '',
    },
    {
      id: 'disposition',
      titleKey: 'miseDispositionTitle',
      subtitleKey: 'miseDispositionSubtitle',
      descKey: 'miseDispositionDesc',
      icon: Clock,
      image: 'https://images.pexels.com/photos/8425052/pexels-photo-8425052.jpeg',
      colSpan: 'md:col-span-6',
      rowSpan: '',
    },
    {
      id: 'transferts',
      titleKey: 'transfertsTitle',
      subtitleKey: 'transfertsSubtitle',
      descKey: 'transfertsDesc',
      icon: Airplane,
      image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800',
      colSpan: 'md:col-span-4',
      rowSpan: 'md:row-span-2',
    },
    {
      id: 'affaires',
      titleKey: 'affairesTitle',
      subtitleKey: 'affairesSubtitle',
      descKey: 'affairesDesc',
      icon: Buildings,
      image: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
      colSpan: 'md:col-span-8',
      rowSpan: '',
    },
  ];

  return (
    <section id="services" className="py-24 md:py-32 bg-[#0A0A0A]" data-testid="services-section">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-[#D4AF37] text-sm tracking-[0.3em] uppercase">{t('nosServicesLabel')}</span>
          <h2 className="text-4xl md:text-5xl font-bold font-['Cormorant_Garamond'] mt-4 tracking-tight" data-testid="services-title">
            {t('servicesTitle1')}
            <br />
            <span className="gold-text">{t('servicesTitle2')}</span>
          </h2>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid grid-cols-1 md:grid-cols-12 gap-6"
        >
          {services.map((service) => (
            <motion.div
              key={service.id}
              variants={itemVariants}
              className={`service-card group relative overflow-hidden rounded-2xl ${service.colSpan} ${service.rowSpan} min-h-[300px] md:min-h-[350px] card-glow transition-all duration-500`}
              data-testid={`service-${service.id}`}
            >
              {/* Background Image */}
              <div className="absolute inset-0">
                <img
                  src={service.image}
                  alt={t(service.titleKey)}
                  className="service-card-img w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/60 to-transparent" />
              </div>

              {/* Content */}
              <div className="relative z-10 h-full flex flex-col justify-end p-8">
                <div className="mb-4">
                  <service.icon size={40} weight="light" className="text-[#D4AF37]" />
                </div>
                <span className="text-[#D4AF37] text-xs tracking-widest uppercase mb-2">
                  {t(service.subtitleKey)}
                </span>
                <h3 className="text-2xl md:text-3xl font-bold font-['Cormorant_Garamond'] mb-3">
                  {t(service.titleKey)}
                </h3>
                <p className="text-[#A1A1AA] text-sm leading-relaxed mb-4 max-w-md">
                  {t(service.descKey)}
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="w-fit border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0A0A0A] transition-all duration-300"
                  data-testid={`service-${service.id}-cta`}
                >
                  <a href="#reserver">{t('reserver')}</a>
                </Button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Services;
