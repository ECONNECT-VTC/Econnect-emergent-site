import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import './LanguageBar.css';

const LANGUAGES = [
  { code: 'fr', label: '🇫🇷' },
  { code: 'en', label: '🇬🇧' },
  { code: 'es', label: '🇪🇸' },
];

const LanguageBar = () => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="language-bar">
      <div className="language-bar-spacer"></div>
      <div className="language-bar-actions">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            className="lang-btn"
            title={lang.label}
            onClick={() => setLanguage(lang.code)}
            style={{
              fontWeight: 'bold',
              color: language === lang.code ? '#D4AF37' : '#A1A1AA',
            }}
          >
            {lang.label}
          </button>
        ))}
        <a href="/login" className="action-btn">{t('connexion')}</a>
        <a href="/register" className="action-btn action-btn--primary">{t('sinscrire')}</a>
      </div>
    </div>
  );
};

export default LanguageBar;
