import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretDown } from '@phosphor-icons/react';
import { useLanguage } from '@/contexts/LanguageContext';

const LanguageDropdown = ({ className = '', fullWidth = false, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { language, languageConfig, setLanguage, isRTL } = useLanguage();

  const languages = Object.entries(languageConfig).map(([code, config]) => ({
    code,
    ...config,
  }));

  const currentLanguage = languageConfig[language];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code) => {
    setLanguage(code);
    setIsOpen(false);
    onSelect?.();
  };

  return (
    <div
      ref={dropdownRef}
      className={`relative ${fullWidth ? 'w-full' : ''} ${className}`.trim()}
      data-testid="language-dropdown"
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''} ${fullWidth ? 'w-full' : ''} gap-3 rounded-xl border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white transition-colors hover:border-[#D4AF37]/50 hover:bg-[#1E1E1E]`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={`flex items-center ${isRTL ? 'flex-row-reverse' : ''} gap-3`}>
          <span className="text-lg" aria-hidden="true">{currentLanguage?.flag}</span>
          <span className="flex flex-col items-start leading-tight">
            <span className="font-semibold text-white">{currentLanguage?.name}</span>
            <span className="text-xs uppercase tracking-[0.2em] text-[#A1A1AA]">{language}</span>
          </span>
        </span>
        <CaretDown size={16} className={`text-[#D4AF37] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className={`absolute z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-white/10 bg-[#111111] p-2 shadow-2xl ${fullWidth ? 'left-0 right-0' : 'right-0 w-72'}`}
          >
            <div className="space-y-1" role="listbox">
              {languages.map((item) => {
                const active = item.code === language;

                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => handleSelect(item.code)}
                    className={`flex w-full items-center ${item.dir === 'rtl' ? 'flex-row-reverse text-right' : ''} justify-between rounded-xl px-3 py-2.5 transition-colors ${active ? 'bg-[#D4AF37]/15 text-[#D4AF37]' : 'text-white hover:bg-white/5'}`}
                    role="option"
                    aria-selected={active}
                    data-testid={`language-option-${item.code}`}
                  >
                    <span className={`flex items-center ${item.dir === 'rtl' ? 'flex-row-reverse' : ''} gap-3`}>
                      <span className="text-lg" aria-hidden="true">{item.flag}</span>
                      <span className="flex flex-col items-start leading-tight">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs uppercase tracking-[0.2em] text-[#A1A1AA]">{item.code}</span>
                      </span>
                    </span>
                    {item.dir === 'rtl' && (
                      <span className="rounded-full border border-[#D4AF37]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
                        RTL
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LanguageDropdown;
