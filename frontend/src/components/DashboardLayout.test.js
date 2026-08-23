import { act } from 'react';
import { createRoot } from 'react-dom/client';
import DashboardLayout from './DashboardLayout';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockLogout = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    useLocation: () => ({ pathname: '/fr/client' }),
    useNavigate: () => mockNavigate,
  };
}, { virtual: true });

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Client Test', role: 'client' },
    logout: mockLogout,
  }),
}), { virtual: true });

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'fr' }),
}), { virtual: true });

jest.mock('@/components/LogoDisplay', () => () => <div>Logo</div>, { virtual: true });
jest.mock('@/components/LanguageDropdown', () => () => <div>Langues</div>, { virtual: true });
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}), { virtual: true });

jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      div: ({ children, ...props }) => React.createElement('div', props, children),
    },
  };
}, { virtual: true });

jest.mock('@phosphor-icons/react', () => {
  const React = require('react');
  const Icon = () => React.createElement('span');
  return {
    House: Icon,
    CalendarCheck: Icon,
    Car: Icon,
    Users: Icon,
    SignOut: Icon,
    List: Icon,
    X: Icon,
    ChartBar: Icon,
    CarSimple: Icon,
    UserCircle: Icon,
    CurrencyEur: Icon,
    ChartLineUp: Icon,
    Percent: Icon,
    FileText: Icon,
    Money: Icon,
  };
}, { virtual: true });

describe('DashboardLayout mobile drawer', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    document.body.style.overflow = '';
    mockLogout.mockReset();
    mockNavigate.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.style.overflow = '';
  });

  it('locks body scroll when the mobile drawer opens and unlocks it after selecting a link', async () => {
    await act(async () => {
      root.render(
        <DashboardLayout title="Mon espace">
          <div>Contenu</div>
        </DashboardLayout>
      );
    });

    const toggle = container.querySelector('[data-testid="mobile-menu-btn"]');

    await act(async () => {
      toggle.click();
    });

    expect(document.body.style.overflow).toBe('hidden');

    const dashboardLink = container.querySelector('[data-testid="nav-dashboard"]');

    await act(async () => {
      dashboardLink.click();
    });

    expect(document.body.style.overflow).toBe('');
    expect(container.textContent).toContain('Contenu');
  });
});
