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

  it('updates API exports when the runtime config object is mutated in place', () => {
    process.env = {
      ...ORIGINAL_ENV,
      REACT_APP_API_URL: 'https://build.example.com',
      REACT_APP_BACKEND_URL: '',
      VITE_API_URL: '',
    };
    window.__ECONNECT_CONFIG__ = {};

    const config = require('./config');

    expect(config.API_URL).toBe('https://build.example.com');
    expect(config.API_URL_SOURCE).toBe('build-config');

    window.__ECONNECT_CONFIG__.API_URL = 'https://runtime.example.com/api';

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

  it('resolves the public contact phone from runtime config before env and formats it for display', () => {
    process.env = {
      ...ORIGINAL_ENV,
      REACT_APP_CONTACT_PHONE: '+33102030405',
    };
    window.__ECONNECT_CONFIG__ = { CONTACT_PHONE: '+33753418833' };

    const { CONTACT_PHONE, CONTACT_PHONE_DISPLAY, WHATSAPP_PHONE, CONTACT_PHONE_SOURCE } = require('./config');

    expect(CONTACT_PHONE).toBe('+33753418833');
    expect(CONTACT_PHONE_DISPLAY).toBe('+33 7 53 41 88 33');
    expect(WHATSAPP_PHONE).toBe('33753418833');
    expect(CONTACT_PHONE_SOURCE).toBe('runtime-config');
  });

  it('normalizes french domestic contact numbers to the shared international display format', () => {
    process.env = {
      ...ORIGINAL_ENV,
      REACT_APP_CONTACT_PHONE: '0753418833',
    };

    const { CONTACT_PHONE, CONTACT_PHONE_DISPLAY, WHATSAPP_PHONE, CONTACT_PHONE_SOURCE } = require('./config');

    expect(CONTACT_PHONE).toBe('+33753418833');
    expect(CONTACT_PHONE_DISPLAY).toBe('+33 7 53 41 88 33');
    expect(WHATSAPP_PHONE).toBe('33753418833');
    expect(CONTACT_PHONE_SOURCE).toBe('build-config');
  });
});
