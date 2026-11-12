import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Footer from './Footer';

let mockLanguage = 'fr';
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: mockLanguage, t: (key) => key }),
}));
jest.mock('@/components/LogoDisplay', () => () => null);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it.each(['fr', 'en'])('links all three public legal documents from the %s footer', async (language) => {
  mockLanguage = language;
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Footer />));
    for (const route of ['conditions-generales', 'mentions-legales', 'politique-confidentialite']) {
      expect(container.querySelector(`a[href="/${language}/${route}"]`)).not.toBeNull();
    }
  } finally { await act(async () => root.unmount()); }
});
