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

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    setIsGammeOpen(false);
  };

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
  const gammeMenuId = 'navbar-gamme-menu';
  const gammeButtonId = 'navbar-gamme-button';

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
        <div className="landing-shell hidden items-center justify-between py-2.5 text-xs uppercase tracking-[0.28em] text-[#C7B588] md:flex">
          <span>Service chauffeur privé premium</span>
          <div className="flex items-center gap-6">
            <span className="inline-flex items-center gap-2">
              <Phone size={12} weight="fill" className="text-[#D4AF37]" />
              +337 53 41 88 33
            </span>
          </div>
        </div>
      </div>

      <nav className="landing-shell flex items-center justify-between gap-4 py-3.5 sm:gap-5 md:py-5 lg:gap-6 lg:py-6">
        <a href="#accueil" className="flex shrink-0 items-center" data-testid="logo">
          <span className="rounded-[28px] border border-[#D4AF37]/20 bg-[#0E0E0E]/90 px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)] sm:px-5 sm:py-3.5">
            <LogoDisplay className="h-[34px] w-[128px] sm:h-[46px] sm:w-[176px] md:h-[58px] md:w-[226px] xl:h-[62px] xl:w-[244px]" priority />
          </span>
        </a>

        <div className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
          <div className="flex min-w-0 items-center gap-6 rounded-full border border-white/8 bg-[#111111]/85 px-6 py-4 xl:gap-8 xl:px-8">
            {navLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className={`${
                  link.key === 'contact' ? 'text-[#D4AF37]' : 'text-[#CFCFCF]'
                } whitespace-nowrap text-[0.88rem] uppercase tracking-[0.18em] transition-colors duration-300 hover:text-[#D4AF37] xl:text-[0.95rem]`}
                data-testid={`nav-link-${link.key}`}
              >
                {t(link.key)}
              </a>
            ))}

            <div
              className="relative"
              onMouseEnter={() => setIsGammeOpen(true)}
              onMouseLeave={() => setIsGammeOpen(false)}
              onBlur={(event) => {
                const menuRoot = event.currentTarget;
                window.setTimeout(() => {
                  if (!menuRoot.contains(document.activeElement)) {
                    setIsGammeOpen(false);
                  }
                }, 0);
              }}
            >
              <button
                id={gammeButtonId}
                type="button"
                onClick={() => setIsGammeOpen((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsGammeOpen(false);
                    return;
                  }
                  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setIsGammeOpen(true);
                  }
                }}
                aria-expanded={isGammeOpen}
                aria-controls={isGammeOpen ? gammeMenuId : undefined}
                className="flex items-center gap-1 whitespace-nowrap text-[0.88rem] uppercase tracking-[0.18em] text-[#CFCFCF] transition-colors duration-300 hover:text-[#D4AF37] xl:text-[0.95rem]"
                data-testid="nav-link-gamme"
              >
                {t('gamme')} <CaretDown size={14} className={`transition-transform duration-200 ${isGammeOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isGammeOpen && (
                  <motion.div
                    id={gammeMenuId}
                    aria-labelledby={gammeButtonId}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="absolute top-full left-0 mt-3 w-52 overflow-hidden rounded-2xl shadow-xl"
                    style={{ background: '#111111', border: '1px solid rgba(212,175,55,0.18)' }}
                  >
                    {GAMME_ITEMS.map((item) => (
                      <a
                        key={item.key}
                        href={item.href}
                        className="block px-4 py-3 text-sm text-[#D4AF37] transition-colors duration-200 hover:bg-[#1A1A1A]"
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
        </div>

        <div className="hidden shrink-0 items-center gap-3 md:flex lg:gap-4">
          <LanguageDropdown />

          <a
            href="#reserver"
            className="rounded-full px-6 py-3 text-[0.95rem] font-semibold transition-all duration-300 hover:scale-105 lg:px-7 lg:py-3.5 lg:text-[1rem]"
            style={{ background: '#D4AF37', color: '#0A0A0A' }}
            data-testid="cta-reserver"
          >
            {t('reserver')}
          </a>

          <Link
            to={`/${language}/login`}
            className="rounded-full border border-[#D4AF37]/70 px-6 py-3 text-[0.95rem] font-semibold text-[#D4AF37] transition-all duration-300 hover:bg-[#D4AF37] hover:text-[#232323] lg:px-7 lg:py-3.5 lg:text-[1rem]"
            data-testid="btn-connexion"
          >
            {t('connexion')}
          </Link>
        </div>

        <div className="md:hidden flex items-center gap-3">
          <button
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#111111]/90 text-[#FAFAFA] transition-colors hover:text-[#D4AF37]"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            data-testid="mobile-menu-toggle"
            aria-label={isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
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
            <div className="flex max-h-[calc(100dvh-5rem)] flex-col gap-4 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6">
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#121212] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <LogoDisplay className="h-[34px] w-[132px]" priority />
                  <div className="shrink-0">
                    <LanguageDropdown />
                  </div>
                </div>
                <a
                  href="tel:+33753418833"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#F3D67A]"
                  onClick={closeMobileMenu}
                >
                  <Phone size={15} weight="fill" />
                  +337 53 41 88 33
                </a>
              </div>

              {navLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  className={`${
                    link.key === 'contact' ? 'text-[#D4AF37]' : 'text-[#A1A1AA]'
                  } hover:text-[#D4AF37] transition-colors py-2 text-lg break-words`}
                  onClick={closeMobileMenu}
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
                      className="py-1 text-base transition-colors duration-200 text-[#D4AF37]"
                      onClick={closeMobileMenu}
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
                onClick={closeMobileMenu}
              >
                {t('reserver')}
              </a>

              {/* Connexion */}
              <Link
                to={`/${language}/login`}
                className="font-semibold w-full text-center py-3 rounded-lg transition-all duration-300"
                style={{ border: '1.5px solid #D4AF37', color: '#D4AF37', background: 'transparent' }}
                onClick={closeMobileMenu}
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
