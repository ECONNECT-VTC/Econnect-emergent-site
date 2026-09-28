import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Hero from './Hero';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key) => key,
  }),
}), { virtual: true });

jest.mock('@/lib/publicAsset', () => ({
  __esModule: true,
  default: (path) => path,
}), { virtual: true });

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, asChild, className, ...props }) => {
    const React = require('react');

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...props,
        className: [children.props.className, className].filter(Boolean).join(' '),
      });
    }

    return React.createElement('button', { ...props, className }, children);
  },
}), { virtual: true });

jest.mock('framer-motion', () => {
  const React = require('react');

  const createPrimitive = (tag) => ({ children, ...props }) => React.createElement(tag, props, children);

  return {
    motion: {
      div: createPrimitive('div'),
      h1: createPrimitive('h1'),
      p: createPrimitive('p'),
    },
  };
}, { virtual: true });

jest.mock('@phosphor-icons/react', () => ({
  CaretDown: () => null,
}), { virtual: true });

describe('Hero responsive layout', () => {
  let container;
  let root;

  beforeEach(() => {
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

  it('keeps the larger desktop hero framing, backdrop crop, and CTA sizing hooks', async () => {
    await act(async () => {
      root.render(<Hero />);
    });

    const heroSection = container.querySelector('[data-testid="hero-section"]');
    const heroTitle = container.querySelector('[data-testid="hero-title"]');
    const reserveCta = container.querySelector('[data-testid="hero-cta-reserver"]');
    const backgroundImage = container.querySelector('img[alt="Luxury car at night"]');

    expect(heroSection).not.toBeNull();
    expect(heroTitle).not.toBeNull();
    expect(reserveCta).not.toBeNull();
    expect(backgroundImage).not.toBeNull();
    expect(heroSection.className).toContain('md:pt-36');
    expect(heroSection.className).toContain('lg:min-h-[105vh]');
    expect(heroTitle.className).toContain('md:max-w-[13ch]');
    expect(heroTitle.className).toContain('text-[clamp(3.15rem,8vw,7.25rem)]');
    expect(reserveCta.className).toContain('lg:min-w-[15rem]');
    expect(backgroundImage.className).toContain('hero-backdrop-image');
  });
});
