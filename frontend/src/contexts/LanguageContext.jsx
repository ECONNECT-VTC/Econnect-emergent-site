import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import translations, {
  DEFAULT_LANGUAGE,
  LANGUAGE_CONFIG,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
} from '@/translations';

const LANGUAGE_STORAGE_KEY = 'preferred-language';
const LanguageContext = createContext(null);

const normalizeLanguage = (value) => {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : null;
};

const getStoredLanguage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
};

const getBrowserLanguage = () => {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const candidates = [navigator.language, ...(navigator.languages || [])];
  return candidates.map(normalizeLanguage).find(Boolean) || DEFAULT_LANGUAGE;
};

const getPathLanguage = (pathname = '/') => {
  const [, firstSegment] = pathname.split('/');
  return normalizeLanguage(firstSegment);
};

const splitPath = (path = '/') => {
  const match = `${path || '/'}`.match(/^([^?#]*)(.*)$/);
  return {
    pathname: match?.[1] || '/',
    suffix: match?.[2] || '',
  };
};

const stripLanguagePrefix = (pathname = '/') => {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length > 0 && SUPPORTED_LANGUAGES.includes(segments[0])) {
    const stripped = `/${segments.slice(1).join('/')}`;
    return stripped === '/' ? '/' : stripped.replace(/\/$/, '') || '/';
  }

  return pathname || '/';
};

export const LanguageProvider = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const preferredLanguage = getStoredLanguage() || getBrowserLanguage() || DEFAULT_LANGUAGE;

  const language = useMemo(
    () => getPathLanguage(location.pathname) || preferredLanguage,
    [location.pathname, preferredLanguage],
  );

  const direction = LANGUAGE_CONFIG[language]?.dir || 'ltr';
  const isRTL = RTL_LANGUAGES.includes(language);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage failures.
    }
  }, [language]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.body?.classList.toggle('rtl', isRTL);
  }, [direction, isRTL, language]);

  const getLocalizedPath = useCallback(
    (path = '/', targetLanguage = language) => {
      const resolvedLanguage = normalizeLanguage(targetLanguage) || DEFAULT_LANGUAGE;

      if (!path) {
        return `/${resolvedLanguage}`;
      }

      if (path.startsWith('#')) {
        return `/${resolvedLanguage}${path}`;
      }

      const { pathname, suffix } = splitPath(path);
      const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
      const localizedPathname = stripLanguagePrefix(normalizedPathname);

      if (localizedPathname === '/') {
        return `/${resolvedLanguage}${suffix}`;
      }

      return `/${resolvedLanguage}${localizedPathname}${suffix}`;
    },
    [language],
  );

  const setLanguage = useCallback(
    (nextLanguage) => {
      const localizedPath = getLocalizedPath(
        `${location.pathname}${location.search}${location.hash}`,
        nextLanguage,
      );

      if (localizedPath !== `${location.pathname}${location.search}${location.hash}`) {
        navigate(localizedPath);
      }
    },
    [getLocalizedPath, location.hash, location.pathname, location.search, navigate],
  );

  const t = useCallback(
    (key) => (translations[language] && translations[language][key]) || translations.fr[key] || key,
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      changeLanguage: setLanguage,
      preferredLanguage,
      direction,
      isRTL,
      t,
      getLocalizedPath,
      getTranslatedLink: getLocalizedPath,
      stripLanguagePrefix,
      isValidLanguage: (candidate) => Boolean(normalizeLanguage(candidate)),
      supportedLanguages: SUPPORTED_LANGUAGES,
      languageConfig: LANGUAGE_CONFIG,
    }),
    [direction, getLocalizedPath, isRTL, language, preferredLanguage, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }

  return context;
};

export default LanguageContext;
