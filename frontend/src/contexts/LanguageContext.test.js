import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider, useLanguage } from './LanguageContext';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useParams: () => ({ lang: 'fr' }),
  useNavigate: () => mockNavigate,
  useLocation: () => ({
    pathname: '/fr/admin/bookings',
    search: '?status=all',
    hash: '#course',
    state: { returnTo: 'bookings' },
  }),
}), { virtual: true });

describe('LanguageProvider route switch', () => {
  let container;
  let root;

  beforeEach(() => {
    mockNavigate.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it('updates the active flag immediately and preserves route context', async () => {
    function Probe() {
      const { language, setLanguage, availableLanguages } = useLanguage();
      const active = availableLanguages.find((item) => item.code === language);
      return <div>
        <span data-testid="flag">{active.flag}</span>
        <button type="button" onClick={() => setLanguage('en')}>English</button>
      </div>;
    }

    await act(async () => root.render(<LanguageProvider><Probe /></LanguageProvider>));
    expect(container.querySelector('[data-testid="flag"]').textContent).toBe('🇫🇷');
    await act(async () => container.querySelector('button').click());
    expect(container.querySelector('[data-testid="flag"]').textContent).toBe('🇬🇧');
    expect(mockNavigate).toHaveBeenCalledWith(
      '/en/admin/bookings?status=all#course',
      { replace: true, state: { returnTo: 'bookings' } },
    );
    expect(localStorage.getItem('preferred-lang')).toBe('en');
  });
});
