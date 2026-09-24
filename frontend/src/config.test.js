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
    expect(API_URL_SOURCE).toBe('build-config');
  });

  it('normalizes configured API values that already end with /api', () => {
    process.env = { ...ORIGINAL_ENV, REACT_APP_API_URL: 'https://api.example.com/api/' };

    const { API_URL } = require('./config');

    expect(API_URL).toBe('https://api.example.com');
  });

  it('prefers runtime API configuration before build-time values', () => {
    process.env = { ...ORIGINAL_ENV, REACT_APP_API_URL: 'https://build.example.com' };
    window.__ECONNECT_CONFIG__ = { API_URL: 'https://runtime.example.com/api' };

    const { API_URL, API_URL_SOURCE } = require('./config');

    expect(API_URL).toBe('https://runtime.example.com');
    expect(API_URL_SOURCE).toBe('runtime-config');
  });

  it('updates API exports when runtime config is assigned after import', () => {
    process.env = {
      ...ORIGINAL_ENV,
      REACT_APP_API_URL: 'https://build.example.com',
      REACT_APP_BACKEND_URL: '',
      VITE_API_URL: '',
    };

    const config = require('./config');

    expect(config.API_URL).toBe('https://build.example.com');
    expect(config.API_URL_SOURCE).toBe('build-config');

    window.__ECONNECT_CONFIG__ = { API_URL: 'https://runtime.example.com/api' };

    expect(config.API_URL).toBe('https://runtime.example.com');
    expect(config.API_URL_SOURCE).toBe('runtime-config');
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
