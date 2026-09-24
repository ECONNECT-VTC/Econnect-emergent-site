const ORIGINAL_ENV = process.env;
const ORIGINAL_LOCATION = window.location;

describe('API config resolution', () => {
  afterEach(() => {
    jest.resetModules();
    process.env = ORIGINAL_ENV;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: ORIGINAL_LOCATION,
    });
    delete window.__ECONNECT_CONFIG__;
  });

  it('prefers REACT_APP_API_URL when configured', () => {
    process.env = { ...ORIGINAL_ENV, REACT_APP_API_URL: 'https://api.example.com' };

    const { API_URL, API_URL_SOURCE } = require('./config');

    expect(API_URL).toBe('https://api.example.com');
    expect(API_URL_SOURCE).toBe('configured');
  });

  it('normalizes configured API values that already end with /api', () => {
    process.env = { ...ORIGINAL_ENV, REACT_APP_API_URL: 'https://api.example.com/api/' };

    const { API_URL } = require('./config');

    expect(API_URL).toBe('https://api.example.com');
  });

  it('falls back to the current origin outside localhost', () => {
    process.env = {
      ...ORIGINAL_ENV,
      REACT_APP_API_URL: '',
      REACT_APP_BACKEND_URL: '',
      VITE_API_URL: '',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://econnect-emergent-site.hostingersite.com'),
    });

    const { API_URL, API_URL_SOURCE } = require('./config');

    expect(API_URL).toBe('https://econnect-emergent-site.hostingersite.com');
    expect(API_URL_SOURCE).toBe('same-origin-fallback');
  });
});
