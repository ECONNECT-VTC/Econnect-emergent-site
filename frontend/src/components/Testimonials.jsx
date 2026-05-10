import { motion } from 'framer-motion';
import { Star, Quotes } from '@phosphor-icons/react';
import { useLanguage } from '@/contexts/LanguageContext';

const testimonials = [
  {
    name: 'Marie D.',
    role: 'Cadre dirigeante',
    content: "Service impeccable pour mes déplacements professionnels. Les chauffeurs sont toujours ponctuels et les véhicules d'une propreté irréprochable.",
    rating: 5,
  },
  {
    name: 'Thomas B.',
    role: 'Voyageur fréquent',
    content: "J'utilise Econnect VTC pour tous mes transferts aéroport. Le suivi en temps réel et l'accueil avec pancarte sont un vrai plus.",
    rating: 5,
  },
  {
    name: 'Sophie L.',
    role: "Organisatrice d'événements",
    content: 'Partenaire de confiance pour nos événements corporate. La gestion de groupe est parfaitement coordonnée.',
    rating: 5,
  },
];

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
    transition: { duration: 0.6 },
  },
};

const Testimonials = () => {
  const { t } = useLanguage();

  return (
    <section className="py-24 md:py-32 bg-[#141414]" data-testid="testimonials-section">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-[#D4AF37] text-sm tracking-[0.3em] uppercase">{t('temoignagesLabel')}</span>
          <h2 className="text-4xl md:text-5xl font-bold font-['Cormorant_Garamond'] mt-4 tracking-tight" data-testid="testimonials-title">
            {t('testimonialsTitle1')}
            <br />
            <span className="gold-text">{t('testimonialsTitle2')}</span>
          </h2>
        </motion.div>

        {/* Testimonials Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="p-8 rounded-2xl bg-[#1E1E1E] border border-white/5 relative"
              data-testid={`testimonial-${index}`}
            >
              {/* Quote Icon */}
              <Quotes size={40} weight="fill" className="text-[#D4AF37]/20 absolute top-6 right-6" />

              {/* Rating */}
              <div className="flex gap-1 mb-6">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} size={18} weight="fill" className="text-[#D4AF37]" />
                ))}
              </div>

              {/* Content */}
              <p className="text-[#FAFAFA] leading-relaxed mb-6">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div>
                <p className="font-semibold text-[#FAFAFA]">{testimonial.name}</p>
                <p className="text-[#A1A1AA] text-sm">{testimonial.role}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Testimonials;
