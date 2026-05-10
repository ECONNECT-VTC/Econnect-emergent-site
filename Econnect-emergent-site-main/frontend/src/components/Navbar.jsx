import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { List, X, CaretDown } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

const LANGUAGES = [
  { code: 'fr', label: '🇫🇷' },
  { code: 'en', label: '🇬🇧' },
  { code: 'es', label: '🇪🇸' },
];

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isGammeOpen, setIsGammeOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();

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
        isScrolled ? 'glass' : 'bg-transparent'
      }`}
      data-testid="navbar"
    >
      <nav className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
        {/* Logo */}
        <a href="#accueil" className="flex items-center gap-2" data-testid="logo">
          <span className="text-2xl md:text-3xl font-bold font-['Cormorant_Garamond'] gold-text">
            Econnect VTC
          </span>
        </a>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="text-[#A1A1AA] hover:text-[#D4AF37] transition-colors duration-300 text-sm tracking-wide uppercase"
              data-testid={`nav-link-${link.key}`}
            >
              {t(link.key)}
            </a>
          ))}

          {/* Gamme dropdown */}
          <div
            className="relative"
            onMouseEnter={() => setIsGammeOpen(true)}
            onMouseLeave={() => setIsGammeOpen(false)}
          >
            <button
              className="flex items-center gap-1 text-[#A1A1AA] hover:text-[#D4AF37] transition-colors duration-300 text-sm tracking-wide uppercase"
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
                  className="absolute top-full left-0 mt-2 w-48 rounded-lg overflow-hidden shadow-xl"
                  style={{ background: '#181818', border: '1px solid rgba(212,175,55,0.15)' }}
                >
                  {GAMME_ITEMS.map((item) => (
                    <a
                      key={item.key}
                      href={item.href}
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

        {/* Right-side actions (desktop) */}
        <div className="hidden md:flex items-center gap-3">
          {/* Language selectors */}
          <div className="flex items-center gap-1 mr-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className="text-base font-bold leading-none px-2 py-1 rounded transition-colors duration-200"
                style={{
                  color: language === lang.code ? '#D4AF37' : '#A1A1AA',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                title={lang.label}
                data-testid={`lang-${lang.code}`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Réserver button */}
          <a
            href="#reserver"
            className="font-semibold px-5 py-2 rounded-lg transition-all duration-300 hover:scale-105 text-sm"
            style={{ background: '#D4AF37', color: '#0A0A0A' }}
            data-testid="cta-reserver"
          >
            {t('reserver')}
          </a>

          {/* Connexion button */}
          <Link
            to="/login"
            className="font-semibold px-5 py-2 rounded-lg transition-all duration-300 text-sm"
            style={{
              background: 'transparent',
              border: '1.5px solid #D4AF37',
              color: '#D4AF37',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#D4AF37'; e.currentTarget.style.color = '#232323'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#D4AF37'; }}
            data-testid="btn-connexion"
          >
            {t('connexion')}
          </Link>

          {/* S'inscrire button */}
          <Link
            to="/register"
            className="font-semibold px-5 py-2 rounded-lg transition-all duration-300 text-sm"
            style={{ background: '#D4AF37', color: '#232323' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F0C74A'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#D4AF37'; }}
            data-testid="btn-sinscrire"
          >
            {t('sinscrire')}
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden text-[#FAFAFA] hover:text-[#D4AF37] transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          data-testid="mobile-menu-toggle"
        >
          {isMobileMenuOpen ? <X size={28} /> : <List size={28} />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden glass border-t border-white/10"
            data-testid="mobile-menu"
          >
            <div className="px-6 py-6 flex flex-col gap-4">
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

              {/* Language selectors */}
              <div className="flex items-center gap-3 py-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className="text-base font-bold px-2 py-1 rounded transition-colors duration-200"
                    style={{
                      color: language === lang.code ? '#D4AF37' : '#A1A1AA',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>

              {/* Réserver button */}
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
                to="/login"
                className="font-semibold w-full text-center py-3 rounded-lg transition-all duration-300"
                style={{ border: '1.5px solid #D4AF37', color: '#D4AF37', background: 'transparent' }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('connexion')}
              </Link>

              {/* S'inscrire */}
              <Link
                to="/register"
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
