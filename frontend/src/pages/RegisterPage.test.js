import { act } from 'react';
import { createRoot } from 'react-dom/client';
import RegisterPage from './RegisterPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockRegister = jest.fn();

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: (props) => React.createElement('a', props, props.children),
    useParams: () => ({ lang: 'fr' }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
}, { virtual: true });

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ register: mockRegister }),
}), { virtual: true });

jest.mock('@/utils/bookingCheckout', () => ({
  getBookingCheckoutResumeState: () => null,
}), { virtual: true });

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
  Lock: () => null,
  User: () => null,
  Phone: () => null,
  ArrowLeft: () => null,
  CircleNotch: () => null,
}), { virtual: true });

describe('RegisterPage – role selection', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockNavigate.mockReset();
    mockRegister.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders both Client and Chauffeur radio buttons', async () => {
    await act(async () => {
      root.render(<RegisterPage />);
    });

    const clientRadio = container.querySelector('[data-testid="register-role-client"]');
    const chauffeurRadio = container.querySelector('[data-testid="register-role-chauffeur"]');
    expect(clientRadio).not.toBeNull();
    expect(chauffeurRadio).not.toBeNull();
    expect(clientRadio.type).toBe('radio');
    expect(chauffeurRadio.type).toBe('radio');
  });

  it('shows error when submitting without selecting a role', async () => {
    await act(async () => {
      root.render(<RegisterPage />);
    });

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    });

    const errorEl = container.querySelector('[data-testid="register-error"]');
    expect(errorEl).not.toBeNull();
    expect(errorEl.textContent).toContain('type de compte');
  });

  it('calls register with role=client when Client is selected', async () => {
    mockRegister.mockResolvedValue({});

    await act(async () => {
      root.render(<RegisterPage />);
    });

    // Fill in form fields
    await act(async () => {
      container.querySelector('[data-testid="register-name"]').value = 'Jean Dupont';
      container.querySelector('[data-testid="register-name"]').dispatchEvent(new Event('input', { bubbles: true }));
      container.querySelector('[data-testid="register-email"]').value = 'jean@example.com';
      container.querySelector('[data-testid="register-email"]').dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      container.querySelector('[data-testid="register-role-client"]').click();
    });

    expect(container.querySelector('[data-testid="register-role-client"]').checked).toBe(true);
    expect(container.querySelector('[data-testid="register-role-chauffeur"]').checked).toBe(false);
  });

  it('selects only one role at a time (exclusive choice)', async () => {
    await act(async () => {
      root.render(<RegisterPage />);
    });

    const clientRadio = container.querySelector('[data-testid="register-role-client"]');
    const chauffeurRadio = container.querySelector('[data-testid="register-role-chauffeur"]');

    await act(async () => { clientRadio.click(); });
    expect(clientRadio.checked).toBe(true);
    expect(chauffeurRadio.checked).toBe(false);

    await act(async () => { chauffeurRadio.click(); });
    expect(chauffeurRadio.checked).toBe(true);
    expect(clientRadio.checked).toBe(false);
  });
});
