// Public configuration only. Set CARTO_API_KEY on the server after building.
// Preserve any API_URL or CONTACT_PHONE configured before this script.
window.__ECONNECT_CONFIG__ = Object.assign(
  { CARTO_API_KEY: '' },
  window.__ECONNECT_CONFIG__ || {}
);
