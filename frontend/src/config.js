const trimValue = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeApiBase = (value) => {
  const trimmedValue = trimValue(value);
  if (!trimmedValue) return '';
  return trimmedValue.replace(/\/+$/, '').replace(/\/api$/, '');
};

const getProcessEnv = () => globalThis.process?.env;

const isLocalHostname = (hostname = '') => (
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '::1'
);

const getRuntimeApiUrl = () => {
  if (typeof window === 'undefined') return '';
  return normalizeApiBase(window.__ECONNECT_CONFIG__?.API_URL);
};

const getFallbackApiUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:8000';
  return isLocalHostname(window.location.hostname) ? 'http://localhost:8000' : window.location.origin;
};

const getBuildTimeApiUrl = () => (
  normalizeApiBase(getProcessEnv()?.REACT_APP_API_URL) ||
  normalizeApiBase(getProcessEnv()?.REACT_APP_BACKEND_URL) ||
  normalizeApiBase(getProcessEnv()?.VITE_API_URL)
);

export let API_URL = '';
export let API_URL_SOURCE = 'same-origin-fallback';

const syncApiConfig = () => {
  const runtimeApiUrl = getRuntimeApiUrl();
  const buildTimeApiUrl = getBuildTimeApiUrl();
  const configuredApiUrl = runtimeApiUrl || buildTimeApiUrl;
  API_URL = configuredApiUrl || getFallbackApiUrl();
  API_URL_SOURCE = runtimeApiUrl
  ? 'runtime-config'
  : buildTimeApiUrl
    ? 'build-config'
    : (
      typeof window !== 'undefined' && isLocalHostname(window.location.hostname)
        ? 'localhost-fallback'
        : 'same-origin-fallback'
    );
};

if (typeof window !== 'undefined') {
  const descriptor = Object.getOwnPropertyDescriptor(window, '__ECONNECT_CONFIG__');
  if (!descriptor || descriptor.configurable) {
    let runtimeConfig = window.__ECONNECT_CONFIG__;
    Object.defineProperty(window, '__ECONNECT_CONFIG__', {
      configurable: true,
      enumerable: true,
      get: () => runtimeConfig,
      set: (value) => {
        runtimeConfig = value;
        syncApiConfig();
      },
    });
  }
}

syncApiConfig();

export { API_URL as default };
