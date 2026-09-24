import { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('axios');
jest.mock('@/config', () => 'http://api.test', { virtual: true });
jest.mock('../../components/PasswordInput', () => (props) => <input {...props} />, { virtual: true });
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}), { virtual: true });
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogTrigger: ({ children }) => <div>{children}</div>,
}), { virtual: true });
jest.mock('@/components/ui/input', () => {
  const React = require('react');
  return {
    Input: React.forwardRef((props, ref) => <input {...props} ref={ref} />),
  };
}, { virtual: true });
jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}), { virtual: true });
jest.mock('@phosphor-icons/react', () => ({
  CarSimple: () => null,
  Plus: () => null,
  Trash: () => null,
}), { virtual: true });

const AdminDrivers = require('./AdminDrivers').default;

describe('AdminDrivers', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    axios.get.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shows an explicit loading error instead of silently rendering an empty list', async () => {
    axios.get.mockRejectedValueOnce({
      response: {
        data: { detail: 'Liste des chauffeurs indisponible' },
      },
    });

    await act(async () => {
      root.render(<AdminDrivers />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Liste des chauffeurs indisponible');
    expect(container.textContent).toContain('0 chauffeur(s)');
  });
});
