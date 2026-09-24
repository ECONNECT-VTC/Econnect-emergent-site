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
jest.mock('@/components/LogoDisplay', () => ({ className }) => <div data-testid="logo-display" className={className}>Logo</div>, { virtual: true });

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

  it('keeps the enlarged landing desktop framing classes on the navbar shell and CTA', async () => {
    await act(async () => {
      root.render(<Navbar />);
    });

    const navbar = container.querySelector('[data-testid="navbar"]');
    const reserveCta = container.querySelector('[data-testid="cta-reserver"]');
    const logoDisplay = container.querySelector('[data-testid="logo-display"]');

    expect(navbar).not.toBeNull();
    expect(reserveCta).not.toBeNull();
    expect(logoDisplay).not.toBeNull();
    expect(navbar.querySelector('nav').className).toContain('landing-shell');
    expect(reserveCta.className).toContain('lg:px-7');
    expect(logoDisplay.className).toContain('md:h-[58px]');
  });

  it('opens the gamme dropdown via click and closes it when focus leaves', async () => {
    await act(async () => {
      root.render(<Navbar />);
    });

    const gammeButton = container.querySelector('[data-testid="nav-link-gamme"]');
    expect(container.querySelector('#navbar-gamme-menu')).toBeNull();

    await act(async () => {
      gammeButton.click();
    });

    expect(gammeButton.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#navbar-gamme-menu')).not.toBeNull();

    const outside = document.createElement('button');
    container.appendChild(outside);

    await act(async () => {
      gammeButton.focus();
      outside.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(gammeButton.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#navbar-gamme-menu')).toBeNull();
  });

  it('supports keyboard open and close on the gamme trigger', async () => {
    await act(async () => {
      root.render(<Navbar />);
    });

    const gammeButton = container.querySelector('[data-testid="nav-link-gamme"]');

    await act(async () => {
      gammeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(gammeButton.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#navbar-gamme-menu')).not.toBeNull();

    await act(async () => {
      gammeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(gammeButton.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#navbar-gamme-menu')).toBeNull();
  });
});
