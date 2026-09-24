const trimValue = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeApiBase = (value) => {
  const trimmedValue = trimValue(value);
  if (!trimmedValue) return '';
  return trimmedValue.replace(/\/+$/, '').replace(/\/api$/, '');
};

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

const configuredApiUrl =
  getRuntimeApiUrl() ||
  normalizeApiBase(process.env.REACT_APP_API_URL) ||
  normalizeApiBase(process.env.REACT_APP_BACKEND_URL) ||
  normalizeApiBase(process.env.VITE_API_URL);

export const API_URL = configuredApiUrl || getFallbackApiUrl();
export const API_URL_SOURCE = configuredApiUrl
  ? 'configured'
  : (
    typeof window !== 'undefined' && isLocalHostname(window.location.hostname)
      ? 'localhost-fallback'
      : 'same-origin-fallback'
  );

export default API_URL;
