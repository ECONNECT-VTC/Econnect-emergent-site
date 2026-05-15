import translations, { LANGUAGE_CONFIG, RTL_LANGUAGES } from './index';

const FALLBACK_LANGUAGES = ['de', 'it', 'pt', 'nl', 'ru', 'pl', 'ja', 'ko', 'zh'];

describe('translations', () => {
  it('keeps Arabic configured as an RTL language', () => {
    expect(LANGUAGE_CONFIG.ar.dir).toBe('rtl');
    expect(RTL_LANGUAGES).toContain('ar');
  });

  it('uses the shared English copy for fallback locales until dedicated translations are added', () => {
    FALLBACK_LANGUAGES.forEach((language) => {
      expect(translations[language]).toEqual(translations.en);
    });
  });

  it('keeps dedicated French, English, Spanish, and Arabic translation sets', () => {
    expect(translations.fr.accueil).toBe('Accueil');
    expect(translations.en.accueil).toBe('Home');
    expect(translations.es.accueil).toBe('Inicio');
    expect(translations.ar.accueil).toBe('الرئيسية');
  });
});
