import { motion } from 'framer-motion';
import { Car } from '@phosphor-icons/react';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import VehicleFeatureBadges from '@/components/VehicleFeatureBadges';
import { VEHICLE_CATEGORY_CONFIG, findVehicleCategoryByName } from '@/utils/vehicleCategories';
import API_URL from '@/config';

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
  const [pricingCategories, setPricingCategories] = useState([]);

  useEffect(() => {
    const fetchPricingCategories = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/vehicle-categories`, {
          withCredentials: true,
        });
        setPricingCategories(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error('[FleetSection] Failed to fetch vehicle categories:', err);
        setPricingCategories([]);
      }
    };

    fetchPricingCategories();
  }, []);

  const gammes = VEHICLE_CATEGORY_CONFIG.map((category) => ({
    ...category,
    adminCategory: findVehicleCategoryByName(pricingCategories, category.backendName),
  })).map((category) => ({
    ...category,
    nameKey: category.translationKey,
    descKey: `${category.translationKey}Desc`,
    price: Number.isFinite(Number(category.adminCategory?.min_fare))
      ? `${Math.round(Number(category.adminCategory.min_fare))}€`
      : category.startingPrice,
  }));

  return (
    <section id="gammes" className="pt-24 pb-12 md:pt-32 md:pb-16 bg-[#141414]" data-testid="fleet-section">
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
                {/* Premium feature icons */}
                <VehicleFeatureBadges
                  passengers={gamme.passengers}
                  luggage={gamme.luggage}
                  hasWifi={gamme.hasWifi}
                  iconSize={15}
                  className="mb-4"
                  itemClassName="text-xs text-[#D4AF37]"
                />
                <span className="text-[#D4AF37] text-sm font-semibold">
                  {t('aPartirDe')} {gamme.price}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <div className="mx-auto mt-6 w-full max-w-4xl rounded-2xl border border-[#D4AF37]/15 bg-[#161616] px-4 py-3 text-sm leading-relaxed text-[#C7B588]">
          Pour toute demande de courses non classique : moto, autocar, bus, limousine, véhicule de collection, contactez-nous ou faites-nous une demande par mail.
        </div>
      </div>
    </section>
  );
};

export default FleetSection;
