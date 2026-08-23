import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Navbar from './Navbar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({ children, ...props }) => React.createElement('a', props, children),
  };
}, { virtual: true });

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'fr',
    t: (key) => key,
  }),
}), { virtual: true });

jest.mock('@/components/LanguageDropdown', () => () => <div data-testid="lang-dropdown">Langues</div>, { virtual: true });
jest.mock('@/components/LogoDisplay', () => () => <div data-testid="logo-display">Logo</div>, { virtual: true });

jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      header: ({ children, ...props }) => React.createElement('header', props, children),
      div: ({ children, ...props }) => React.createElement('div', props, children),
    },
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
  };
}, { virtual: true });

jest.mock('@phosphor-icons/react', () => ({
  List: () => null,
  X: () => null,
  CaretDown: () => null,
  Phone: () => null,
}), { virtual: true });

describe('Navbar mobile menu', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    document.body.style.overflow = '';
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.style.overflow = '';
  });

  it('locks body scroll while the mobile menu is open and restores it after navigation', async () => {
    await act(async () => {
      root.render(<Navbar />);
    });

    const toggle = container.querySelector('[data-testid="mobile-menu-toggle"]');

    await act(async () => {
      toggle.click();
    });

    expect(container.querySelector('[data-testid="mobile-menu"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    const reserveLink = container.querySelector('[data-testid="mobile-menu"] a[href="#reserver"]');

    await act(async () => {
      reserveLink.click();
    });

    expect(container.querySelector('[data-testid="mobile-menu"]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
