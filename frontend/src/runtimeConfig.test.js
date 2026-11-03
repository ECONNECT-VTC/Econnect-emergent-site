const fs = require('fs');
const path = require('path');
const vm = require('vm');

const publicDir = path.resolve(__dirname, '../public');
const runtimeScript = fs.readFileSync(path.join(publicDir, 'runtime-config.js'), 'utf8');

describe('runtime configuration bootstrap', () => {
  afterEach(() => {
    delete window.__ECONNECT_CONFIG__;
    jest.resetModules();
  });

  it('loads the runtime script synchronously in the HTML head before the bundle', () => {
    const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const script = html.match(/<script[^>]+src="%PUBLIC_URL%\/runtime-config\.js"[^>]*><\/script>/);

    expect(script).not.toBeNull();
    expect(script[0]).not.toMatch(/\b(async|defer|type="module")\b/);
    expect(html.indexOf(script[0])).toBeLessThan(html.indexOf('</head>'));
  });

  it('ships an empty public key and preserves existing runtime configuration', () => {
    const context = { window: {} };
    vm.runInNewContext(runtimeScript, context);
    expect(context.window.__ECONNECT_CONFIG__).toEqual({ CARTO_API_KEY: '' });

    context.window.__ECONNECT_CONFIG__ = {
      CARTO_API_KEY: 'existing-test-key',
      API_URL: 'https://api.example.com',
      CONTACT_PHONE: '+33102030405',
    };
    vm.runInNewContext(runtimeScript, context);
    expect(context.window.__ECONNECT_CONFIG__).toEqual({
      CARTO_API_KEY: 'existing-test-key',
      API_URL: 'https://api.example.com',
      CONTACT_PHONE: '+33102030405',
    });
  });

  it('accepts a server-injected key before the application config loads', () => {
    const context = { window: {} };
    vm.runInNewContext(runtimeScript.replace("CARTO_API_KEY: ''", "CARTO_API_KEY: 'server-test-key'"), context);
    window.__ECONNECT_CONFIG__ = context.window.__ECONNECT_CONFIG__;

    const { getCartoApiKey } = require('./config');
    expect(getCartoApiKey()).toBe('server-test-key');
  });
});
