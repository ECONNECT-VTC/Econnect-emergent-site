import { act } from 'react';
import { createRoot } from 'react-dom/client';
import LanguageDropdown from './LanguageDropdown';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockSetLanguage = jest.fn();
let mockLanguage = 'fr';

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: mockLanguage,
    setLanguage: mockSetLanguage,
    availableLanguages: [
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'en', name: 'English', flag: '🇬🇧' },
    ],
  }),
}), { virtual: true });

jest.mock('@/lib/utils', () => ({
  cn: (...inputs) => inputs.filter(Boolean).join(' '),
}), { virtual: true });

jest.mock('framer-motion', () => {
  const React = require('react');

  return {
    motion: {
      ul: ({ children, ...props }) => React.createElement('ul', props, children),
    },
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
  };
}, { virtual: true });

jest.mock('@phosphor-icons/react', () => ({
  CaretDown: () => null,
}), { virtual: true });

describe('LanguageDropdown', () => {
  let container;
  let root;

  beforeEach(() => {
    mockLanguage = 'fr';
    mockSetLanguage.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('applies optional button and menu class overrides', async () => {
    await act(async () => {
      root.render(
        <LanguageDropdown
          buttonClassName="custom-trigger"
          menuClassName="custom-menu"
        />,
      );
    });

    const toggle = container.querySelector('[data-testid="lang-dropdown-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle.className).toContain('custom-trigger');

    await act(async () => {
      toggle.click();
    });

    const menu = container.querySelector('[data-testid="lang-dropdown-list"]');
    expect(menu).not.toBeNull();
    expect(menu.className).toContain('custom-menu');
  });

  it('selects a language and closes the menu', async () => {
    await act(async () => root.render(<LanguageDropdown />));
    await act(async () => container.querySelector('[data-testid="lang-dropdown-toggle"]').click());
    await act(async () => container.querySelector('[data-testid="lang-option-en"]').click());
    expect(mockSetLanguage).toHaveBeenCalledWith('en');
    expect(container.querySelector('[data-testid="lang-dropdown-list"]')).toBeNull();
  });
});
