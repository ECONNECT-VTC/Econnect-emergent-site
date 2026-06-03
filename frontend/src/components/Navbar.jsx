import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { List, X, CaretDown, Phone } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageDropdown from '@/components/LanguageDropdown';
import LogoDisplay from '@/components/LogoDisplay';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isGammeOpen, setIsGammeOpen] = useState(false);
  const { language, t } = useLanguage();

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

  const GAMME_ITEMS = [
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
        isScrolled ? 'bg-[#0A0A0A]/92 backdrop-blur-xl border-b border-[#D4AF37]/10' : 'bg-transparent'
      }`}
      data-testid="navbar"
    >
      <div className="border-b border-white/5 bg-[#050505]/85">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-2 hidden md:flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-[#C7B588]">
          <span>Service chauffeur privé premium</span>
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-2">
              <Phone size={12} weight="fill" className="text-[#D4AF37]" />
              +337 53 41 88 33
            </span>
            <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-[#F3D67A]">
              {language.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <nav className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-3 md:py-4 flex items-center justify-between gap-4">
        <a href="#accueil" className="flex items-center" data-testid="logo">
          <span className="rounded-[22px] border border-[#D4AF37]/20 bg-[#0E0E0E]/90 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
            <LogoDisplay className="h-[40px] w-[150px] sm:h-[46px] sm:w-[172px] md:h-[56px] md:w-[220px]" priority />
          </span>
        </a>

        <div className="hidden lg:flex items-center gap-7 rounded-full border border-white/8 bg-[#111111]/85 px-6 py-3">
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="text-[#CFCFCF] hover:text-[#D4AF37] transition-colors duration-300 text-sm tracking-[0.2em] uppercase"
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
              className="flex items-center gap-1 text-[#CFCFCF] hover:text-[#D4AF37] transition-colors duration-300 text-sm tracking-[0.2em] uppercase"
              data-testid="nav-link-gamme"
            >
              {t('gamme')} <CaretDown size={14} className={`transition-transform duration-200 ${isGammeOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {isGammeOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className="absolute top-full left-0 mt-3 w-52 rounded-2xl overflow-hidden shadow-xl"
                  style={{ background: '#111111', border: '1px solid rgba(212,175,55,0.18)' }}
                >
                  {GAMME_ITEMS.map((item) => (
                    <a
                      key={item.key}
                      href={item.href}
                      className="block px-4 py-3 text-sm transition-colors duration-200 hover:bg-[#1A1A1A]"
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

        <div className="hidden md:flex items-center gap-3">
          <LanguageDropdown />

          <a
            href="#reserver"
            className="font-semibold px-5 py-2.5 rounded-full transition-all duration-300 hover:scale-105 text-sm"
            style={{ background: '#D4AF37', color: '#0A0A0A' }}
            data-testid="cta-reserver"
          >
            {t('reserver')}
          </a>

          <Link
            to={`/${language}/login`}
            className="font-semibold px-5 py-2.5 rounded-full transition-all duration-300 text-sm border border-[#D4AF37]/70 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#232323]"
            data-testid="btn-connexion"
          >
            {t('connexion')}
          </Link>
        </div>

        <div className="md:hidden flex items-center gap-3">
          <button
            className="text-[#FAFAFA] hover:text-[#D4AF37] transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            data-testid="mobile-menu-toggle"
          >
            {isMobileMenuOpen ? <X size={28} /> : <List size={28} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden border-t border-[#D4AF37]/10 bg-[#090909]/98 backdrop-blur-xl"
            data-testid="mobile-menu"
          >
            <div className="px-6 py-6 flex flex-col gap-4">
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#121212] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <LogoDisplay className="h-[34px] w-[132px]" priority />
                  <div className="min-w-[110px]">
                    <LanguageDropdown />
                  </div>
                </div>
                <a
                  href="tel:+33753418833"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#F3D67A]"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Phone size={15} weight="fill" />
                  +337 53 41 88 33
                </a>
              </div>

              {navLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  className="text-[#A1A1AA] hover:text-[#D4AF37] transition-colors py-2 text-lg"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {t(link.key)}
                </a>
              ))}

              {/* Gamme sub-items in mobile */}
              <div>
                <p className="text-[#A1A1AA] text-sm uppercase tracking-wide py-1">{t('gamme')}</p>
                <div className="pl-4 flex flex-col gap-2 mt-1">
                  {GAMME_ITEMS.map((item) => (
                    <a
                      key={item.key}
                      href={item.href}
                      className="py-1 text-base transition-colors duration-200"
                      style={{ color: '#C7B588' }}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {t(item.key)}
                    </a>
                  ))}
                </div>
              </div>

              <a
                href="#reserver"
                className="font-semibold w-full text-center py-3 rounded-lg transition-all duration-300 mt-2"
                style={{ background: '#D4AF37', color: '#0A0A0A' }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('reserver')}
              </a>

              {/* Connexion */}
              <Link
                to={`/${language}/login`}
                className="font-semibold w-full text-center py-3 rounded-lg transition-all duration-300"
                style={{ border: '1.5px solid #D4AF37', color: '#D4AF37', background: 'transparent' }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('connexion')}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Navbar;
