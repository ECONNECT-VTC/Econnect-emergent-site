import { act } from 'react';
import { createRoot } from 'react-dom/client';
import WhatsAppButton from './WhatsAppButton';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      a: ({ children, ...props }) => React.createElement('a', props, children),
    },
  };
}, { virtual: true });

jest.mock('@phosphor-icons/react', () => ({
  WhatsappLogo: () => null,
}), { virtual: true });

describe('WhatsAppButton', () => {
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

  it('renders the floating premium wrapper and preserves the configured WhatsApp number', async () => {
    await act(async () => {
      root.render(<WhatsAppButton />);
    });

    const whatsappButton = container.querySelector('[data-testid="whatsapp-button"]');

    expect(whatsappButton).not.toBeNull();
    expect(whatsappButton.getAttribute('href')).toContain('https://wa.me/33753418833');
    expect(whatsappButton.className).toContain('bg-[#050505]/78');
    expect(whatsappButton.textContent).toBe('');
    expect(whatsappButton.querySelector('span').className).toContain('pulse-gold');
  });
});
