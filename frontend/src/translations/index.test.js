import translations from './index';

describe('translations Comfort wording', () => {
  it('does not expose "Comfort" in user-visible translation strings', () => {
    Object.values(translations).forEach((localeTranslations) => {
      Object.values(localeTranslations).forEach((value) => {
        if (typeof value === 'string') {
          expect(value).not.toContain('Comfort');
        }
      });
    });
  });

  it('uses Confort labels for fleet categories in French', () => {
    expect(translations.fr.comfortClassique).toBe('Confort Classique');
    expect(translations.fr.comfortPremium).toBe('Confort Premium');
  });
});
