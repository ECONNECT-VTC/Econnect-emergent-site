import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const LANGUAGES = [
  { code: 'fr', label: '🇫🇷' },
  { code: 'en', label: '🇬🇧' },
  { code: 'es', label: '🇪🇸' },
];

const LanguageSelector = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-bar">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          title={lang.label}
          onClick={() => setLanguage(lang.code)}
          style={{
            fontWeight: 'bold',
            color: language === lang.code ? '#D4AF37' : '#A1A1AA',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSelector;
