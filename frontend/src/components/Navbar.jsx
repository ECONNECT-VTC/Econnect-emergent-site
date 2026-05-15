import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { List, X, CaretDown } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import LanguageDropdown from '@/components/LanguageDropdown';
import { useLanguage } from '@/contexts/LanguageContext';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isGammeOpen, setIsGammeOpen] = useState(false);
  const { t, getLocalizedPath, isRTL } = useLanguage();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { key: 'accueil', href: '#accueil' },
    { key: 'services', href: '#services' },
    { key: 'apropos', href: '#apropos' },
    { key: 'contact', href: '#contact' },
  ];

  const gammeItems = [
    { key: 'comfortClassique', href: '#gammes' },
    { key: 'comfortPremium', href: '#gammes' },
    { key: 'prestige', href: '#gammes' },
    { key: 'van', href: '#gammes' },
  ];

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'glass' : 'bg-transparent'
      }`}
      data-testid="navbar"
    >
      <nav
        className={`max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between ${
          isRTL ? 'flex-row-reverse' : ''
        }`}
      >
        <a href={getLocalizedPath('#accueil')} className="flex items-center gap-2" data-testid="logo">
          <span className="text-2xl md:text-3xl font-bold font-['Cormorant_Garamond'] gold-text">
            Econnect VTC
          </span>
        </a>

        <div className={`hidden md:flex items-center gap-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={getLocalizedPath(link.href)}
              className="text-[#A1A1AA] hover:text-[#D4AF37] transition-colors duration-300 text-sm tracking-wide uppercase"
              data-testid={`nav-link-${link.key}`}
            >
              {t(link.key)}
            </a>
          ))}

          <div
            className="relative"
            onMouseEnter={() => setIsGammeOpen(true)}
            onMouseLeave={() => setIsGammeOpen(false)}
          >
            <button
              type="button"
              className={`flex items-center gap-1 text-[#A1A1AA] hover:text-[#D4AF37] transition-colors duration-300 text-sm tracking-wide uppercase ${
                isRTL ? 'flex-row-reverse' : ''
              }`}
              data-testid="nav-link-gamme"
            >
              {t('gamme')}
              <CaretDown
                size={14}
                className={`transition-transform duration-200 ${isGammeOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <AnimatePresence>
              {isGammeOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className={`absolute top-full mt-2 w-48 rounded-lg overflow-hidden shadow-xl ${
                    isRTL ? 'right-0 text-right' : 'left-0'
                  }`}
                  style={{ background: '#181818', border: '1px solid rgba(212,175,55,0.15)' }}
                >
                  {gammeItems.map((item) => (
                    <a
                      key={item.key}
                      href={getLocalizedPath(item.href)}
                      className="block px-4 py-3 text-sm transition-colors duration-200 hover:bg-[#232323]"
                      style={{ color: '#C7B588' }}
                      onClick={() => setIsGammeOpen(false)}
                    >
                      {t(item.key)}
                    </a>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className={`hidden md:flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <LanguageDropdown className="mr-2" />

          <a
            href={getLocalizedPath('#reserver')}
            className="font-semibold px-5 py-2 rounded-lg transition-all duration-300 hover:scale-105 text-sm"
            style={{ background: '#D4AF37', color: '#0A0A0A' }}
            data-testid="cta-reserver"
          >
            {t('reserver')}
          </a>

          <Link
            to={getLocalizedPath('/login')}
            className="font-semibold px-5 py-2 rounded-lg transition-all duration-300 text-sm"
            style={{
              background: 'transparent',
              border: '1.5px solid #D4AF37',
              color: '#D4AF37',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#D4AF37';
              e.currentTarget.style.color = '#232323';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#D4AF37';
            }}
            data-testid="btn-connexion"
          >
            {t('connexion')}
          </Link>

          <Link
            to={getLocalizedPath('/register')}
            className="font-semibold px-5 py-2 rounded-lg transition-all duration-300 text-sm"
            style={{ background: '#D4AF37', color: '#232323' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F0C74A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#D4AF37';
            }}
            data-testid="btn-sinscrire"
          >
            {t('sinscrire')}
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden text-[#FAFAFA] hover:text-[#D4AF37] transition-colors"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          data-testid="mobile-menu-toggle"
        >
          {isMobileMenuOpen ? <X size={28} /> : <List size={28} />}
        </button>
      </nav>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden glass border-t border-white/10"
            data-testid="mobile-menu"
          >
            <div className={`px-6 py-6 flex flex-col gap-4 ${isRTL ? 'text-right' : ''}`}>
              {navLinks.map((link) => (
                <a
                  key={link.key}
                  href={getLocalizedPath(link.href)}
                  className="text-[#A1A1AA] hover:text-[#D4AF37] transition-colors py-2 text-lg"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {t(link.key)}
                </a>
              ))}

              <div>
                <p className="text-[#A1A1AA] text-sm uppercase tracking-wide py-1">{t('gamme')}</p>
                <div className={`flex flex-col gap-2 mt-1 ${isRTL ? 'pr-4' : 'pl-4'}`}>
                  {gammeItems.map((item) => (
                    <a
                      key={item.key}
                      href={getLocalizedPath(item.href)}
                      className="py-1 text-base transition-colors duration-200"
                      style={{ color: '#C7B588' }}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {t(item.key)}
                    </a>
                  ))}
                </div>
              </div>

              <LanguageDropdown fullWidth onSelect={() => setIsMobileMenuOpen(false)} />

              <a
                href={getLocalizedPath('#reserver')}
                className="font-semibold w-full text-center py-3 rounded-lg transition-all duration-300 mt-2"
                style={{ background: '#D4AF37', color: '#0A0A0A' }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('reserver')}
              </a>

              <Link
                to={getLocalizedPath('/login')}
                className="font-semibold w-full text-center py-3 rounded-lg transition-all duration-300"
                style={{ border: '1.5px solid #D4AF37', color: '#D4AF37', background: 'transparent' }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('connexion')}
              </Link>

              <Link
                to={getLocalizedPath('/register')}
                className="font-semibold w-full text-center py-3 rounded-lg transition-all duration-300"
                style={{ background: '#D4AF37', color: '#232323' }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('sinscrire')}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Navbar;
