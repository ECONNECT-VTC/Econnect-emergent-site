import { translateDashboard } from './dashboardTranslations';

describe('private dashboard translations', () => {
  it('changes immediately with the selected language', () => {
    expect(translateDashboard('fr', 'earnings')).toBe('Mes Gains');
    expect(translateDashboard('en', 'earnings')).toBe('My earnings');
    expect(translateDashboard('es', 'earnings')).toBe('Mis ganancias');
  });

  it('does not remain French when a supported language has no private key', () => {
    expect(translateDashboard('ja', 'earnings')).toBe('収益');
    expect(translateDashboard('ar', 'availability')).toBe('التوفر');
  });
});
