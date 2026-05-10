import { motion } from 'framer-motion';
import { Phone, Envelope, MapPin, InstagramLogo, FacebookLogo, LinkedinLogo } from '@phosphor-icons/react';
import { useLanguage } from '@/contexts/LanguageContext';

const Footer = () => {
  const { t } = useLanguage();

  const navLinks = [
    { key: 'footerNavAccueil', href: '#accueil' },
    { key: 'footerNavServices', href: '#services' },
    { key: 'footerNavReserver', href: '#reserver' },
    { key: 'footerNavApropos', href: '#apropos' },
    { key: 'footerNavContact', href: '#contact' },
  ];

  return (
    <footer id="contact" className="py-24 bg-[#0A0A0A] border-t border-white/5" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-2">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold font-['Cormorant_Garamond'] gold-text mb-6"
            >
              Econnect VTC
            </motion.h2>
            <p className="text-[#A1A1AA] max-w-md leading-relaxed mb-6">
              {t('footerBrandDesc')}
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-[#141414] border border-white/10 flex items-center justify-center hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-all duration-300 group"
                data-testid="social-instagram"
              >
                <InstagramLogo size={20} className="text-[#A1A1AA] group-hover:text-[#0A0A0A]" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-[#141414] border border-white/10 flex items-center justify-center hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-all duration-300 group"
                data-testid="social-facebook"
              >
                <FacebookLogo size={20} className="text-[#A1A1AA] group-hover:text-[#0A0A0A]" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-[#141414] border border-white/10 flex items-center justify-center hover:bg-[#D4AF37] hover:border-[#D4AF37] transition-all duration-300 group"
                data-testid="social-linkedin"
              >
                <LinkedinLogo size={20} className="text-[#A1A1AA] group-hover:text-[#0A0A0A]" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-6">{t('navigation')}</h3>
            <ul className="space-y-3">
              {navLinks.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.href}
                    className="text-[#A1A1AA] hover:text-[#D4AF37] transition-colors"
                  >
                    {t(link.key)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-semibold mb-6">{t('contact')}</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Phone size={20} className="text-[#D4AF37] mt-1" />
                <a href="tel:+33XXXXXXXXX" className="text-[#A1A1AA] hover:text-[#D4AF37] transition-colors" data-testid="contact-phone">
                  +33 X XX XX XX XX
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Envelope size={20} className="text-[#D4AF37] mt-1" />
                <a href="mailto:contact@econnect-vtc.com" className="text-[#A1A1AA] hover:text-[#D4AF37] transition-colors" data-testid="contact-email">
                  contact@econnect-vtc.com
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={20} className="text-[#D4AF37] mt-1" />
                <span className="text-[#A1A1AA]">
                  Paris et Île-de-France
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[#A1A1AA] text-sm">
            {t('copyright')}
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-[#A1A1AA] text-sm hover:text-[#D4AF37] transition-colors">
              {t('mentionsLegales')}
            </a>
            <a href="#" className="text-[#A1A1AA] text-sm hover:text-[#D4AF37] transition-colors">
              {t('politiqueConfidentialite')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
