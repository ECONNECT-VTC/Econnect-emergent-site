import { createContext, useContext, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import translations from '@/translations';

export const LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'en', name: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'es', name: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', dir: 'ltr' },
  { code: 'pt', name: 'Português', flag: '🇵🇹', dir: 'ltr' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱', dir: 'ltr' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', dir: 'ltr' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱', dir: 'ltr' },
  { code: 'ja', name: '日本語', flag: '🇯🇵', dir: 'ltr' },
  { code: 'ko', name: '한국어', flag: '🇰🇷', dir: 'ltr' },
  { code: 'zh', name: '中文', flag: '🇨🇳', dir: 'ltr' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', dir: 'rtl' },
];

const VALID_LANG_CODES = LANGUAGES.map((l) => l.code);

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const { lang } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const language = VALID_LANG_CODES.includes(lang) ? lang : 'fr';
  const isRTL = language === 'ar';

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    localStorage.setItem('preferred-lang', language);
  }, [language, isRTL]);

  const setLanguage = (code) => {
    if (!VALID_LANG_CODES.includes(code)) return;
    const pathWithoutLang = location.pathname.replace(/^\/[^/]+/, '') || '/';
    navigate('/' + code + pathWithoutLang, { replace: true });
  };

  const t = (key) => {
    return translations[language]?.[key] ?? translations['fr']?.[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL, availableLanguages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;
