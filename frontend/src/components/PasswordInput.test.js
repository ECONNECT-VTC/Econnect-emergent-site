import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PasswordInput from './PasswordInput';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/components/ui/input', () => {
  const React = require('react');
  return {
    Input: React.forwardRef((props, ref) => React.createElement('input', { ...props, ref })),
  };
}, { virtual: true });

jest.mock('@phosphor-icons/react', () => ({
  Eye: () => null,
  EyeSlash: () => null,
}), { virtual: true });

describe('PasswordInput', () => {
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

  it('toggles the password visibility with accessible labels', async () => {
    await act(async () => {
      root.render(<PasswordInput value="Secret123!" onChange={() => {}} />);
    });

    const input = container.querySelector('input');
    const toggle = container.querySelector('button');

    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Afficher le mot de passe');

    await act(async () => {
      toggle.click();
    });

    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Masquer le mot de passe');
  });
});
