import { act } from 'react';
import { createRoot } from 'react-dom/client';
import VerifyEmailPending from './VerifyEmailPending';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: (props) => React.createElement('a', props, props.children),
    useParams: () => ({ lang: 'fr' }),
    useLocation: () => ({
      state: {
        email: 'jean@example.com',
        activationEmailSent: false,
      },
    }),
  };
}, { virtual: true });

jest.mock('axios', () => ({ post: jest.fn() }), { virtual: true });

jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      div: ({ children, ...props }) => React.createElement('div', props, children),
    },
  };
}, { virtual: true });

jest.mock('@/components/ui/button', () => {
  const React = require('react');
  return {
    Button: ({ children, ...props }) => React.createElement('button', props, children),
  };
}, { virtual: true });

jest.mock('@/components/ui/input', () => {
  const React = require('react');
  return {
    Input: (props) => React.createElement('input', props),
  };
}, { virtual: true });

jest.mock('@/components/ui/label', () => {
  const React = require('react');
  return {
    Label: ({ children, ...props }) => React.createElement('label', props, children),
  };
}, { virtual: true });

jest.mock('@phosphor-icons/react', () => ({
  Envelope: () => null,
  CircleNotch: () => null,
  CheckCircle: () => null,
}), { virtual: true });

describe('VerifyEmailPending', () => {
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

  it("shows the fallback message when the activation email could not be sent yet", async () => {
    await act(async () => {
      root.render(<VerifyEmailPending />);
    });

    expect(container.textContent).toContain("l'email d'activation n'a pas encore pu être envoyé");
    expect(container.textContent).toContain('jean@example.com');
  });
});
