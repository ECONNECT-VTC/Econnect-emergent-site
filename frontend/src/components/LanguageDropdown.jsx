import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown } from '@phosphor-icons/react';
import { useLanguage } from '@/contexts/LanguageContext';

const LanguageDropdown = () => {
  const { language, setLanguage, availableLanguages } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentLang = availableLanguages.find((l) => l.code === language) || availableLanguages[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code) => {
    setLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 text-sm font-semibold"
        style={{
          background: isOpen ? 'rgba(212,175,55,0.12)' : 'transparent',
          border: '1.5px solid rgba(212,175,55,0.35)',
          color: '#D4AF37',
          cursor: 'pointer',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-testid="lang-dropdown-toggle"
      >
        <span className="text-base leading-none">{currentLang.flag}</span>
        <span className="uppercase tracking-wide">{currentLang.code}</span>
        <CaretDown
          size={12}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-48 rounded-xl overflow-hidden shadow-2xl z-50"
            style={{
              background: '#181818',
              border: '1px solid rgba(212,175,55,0.2)',
            }}
            data-testid="lang-dropdown-list"
          >
            {availableLanguages.map((lang) => {
              const isActive = lang.code === language;
              return (
                <li key={lang.code} role="option" aria-selected={isActive}>
                  <button
                    onClick={() => handleSelect(lang.code)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150"
                    style={{
                      background: isActive ? 'rgba(212,175,55,0.12)' : 'transparent',
                      color: isActive ? '#D4AF37' : '#A1A1AA',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                    data-testid={`lang-option-${lang.code}`}
                  >
                    <span className="text-base leading-none">{lang.flag}</span>
                    <span className="flex-1">{lang.name}</span>
                    {isActive && (
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: '#D4AF37' }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LanguageDropdown;
