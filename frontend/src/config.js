const trimValue = (value) => (typeof value === 'string' ? value.trim() : '');
const CONTACT_PHONE_FALLBACK = '+33753418833';

const normalizeApiBase = (value) => {
  const trimmedValue = trimValue(value);
  if (!trimmedValue) return '';
  return trimmedValue.replace(/\/+$/, '').replace(/\/api$/, '');
};

const normalizePhone = (value) => {
  const trimmedValue = trimValue(value);
  if (!trimmedValue) return '';

  if (trimmedValue.startsWith('+')) {
    return `+${trimmedValue.slice(1).replace(/\D/g, '')}`;
  }

  return trimmedValue.replace(/\D/g, '');
};

const formatPhoneDisplay = (value) => {
  const normalizedPhone = normalizePhone(value);

  if (!normalizedPhone) return '';

  const frenchPhoneMatch = normalizedPhone.match(/^\+?33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);

  if (frenchPhoneMatch) {
    const [, part1, part2, part3, part4, part5] = frenchPhoneMatch;
    return `+33 ${part1} ${part2} ${part3} ${part4} ${part5}`;
  }

  return normalizedPhone;
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

const getRuntimeContactPhone = () => {
  if (typeof window === 'undefined') return '';
  return normalizePhone(window.__ECONNECT_CONFIG__?.CONTACT_PHONE);
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

const getBuildTimeContactPhone = () => (
  normalizePhone(getProcessEnv()?.REACT_APP_CONTACT_PHONE) ||
  normalizePhone(getProcessEnv()?.VITE_CONTACT_PHONE)
);

export let API_URL = '';
export let API_URL_SOURCE = 'same-origin-fallback';
export let CONTACT_PHONE = '';
export let CONTACT_PHONE_DISPLAY = '';
export let WHATSAPP_PHONE = '';
export let CONTACT_PHONE_SOURCE = 'fallback';

const runtimeConfigProxies = new WeakMap();

const syncApiConfig = () => {
  const runtimeApiUrl = getRuntimeApiUrl();
  const buildTimeApiUrl = getBuildTimeApiUrl();
  const configuredApiUrl = runtimeApiUrl || buildTimeApiUrl;
  const runtimeContactPhone = getRuntimeContactPhone();
  const buildTimeContactPhone = getBuildTimeContactPhone();
  const configuredContactPhone = runtimeContactPhone || buildTimeContactPhone || CONTACT_PHONE_FALLBACK;

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

  CONTACT_PHONE = configuredContactPhone;
  CONTACT_PHONE_DISPLAY = formatPhoneDisplay(configuredContactPhone);
  WHATSAPP_PHONE = configuredContactPhone.replace(/\D/g, '');
  CONTACT_PHONE_SOURCE = runtimeContactPhone
    ? 'runtime-config'
    : buildTimeContactPhone
      ? 'build-config'
      : 'fallback';
};

const wrapRuntimeConfig = (value) => {
  if (!value || typeof value !== 'object') return value;
  const existingProxy = runtimeConfigProxies.get(value);
  if (existingProxy) return existingProxy;

  const proxy = new Proxy(value, {
    set(target, property, nextValue) {
    target[property] = nextValue;
    syncApiConfig();
    return true;
    },
    deleteProperty(target, property) {
    delete target[property];
    syncApiConfig();
    return true;
    },
  });

  runtimeConfigProxies.set(value, proxy);
  return proxy;
};

if (typeof window !== 'undefined') {
  const descriptor = Object.getOwnPropertyDescriptor(window, '__ECONNECT_CONFIG__');
  if (!descriptor || descriptor.configurable) {
    let runtimeConfig = wrapRuntimeConfig(window.__ECONNECT_CONFIG__);
    Object.defineProperty(window, '__ECONNECT_CONFIG__', {
    configurable: true,
    enumerable: true,
    get: () => runtimeConfig,
    set: (value) => {
      runtimeConfig = wrapRuntimeConfig(value);
      syncApiConfig();
    },
    });
  }
}

syncApiConfig();

export { API_URL as default };
