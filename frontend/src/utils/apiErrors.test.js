describe('parseApiError', () => {
  const ORIGINAL_ENV = process.env;
  const ORIGINAL_LOCATION = window.location;

  afterEach(() => {
    jest.resetModules();
    process.env = ORIGINAL_ENV;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: ORIGINAL_LOCATION,
    });
  });

  it('returns a Hostinger-focused API configuration hint for localhost network fallbacks', () => {
    process.env = {
      ...ORIGINAL_ENV,
      REACT_APP_API_URL: '',
      REACT_APP_BACKEND_URL: '',
      VITE_API_URL: '',
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost:3000'),
    });

    const { parseApiError } = require('./apiErrors');

    const message = parseApiError({ message: 'Network Error', code: 'ERR_NETWORK' });

    expect(message).toContain('REACT_APP_API_URL');
    expect(message).toContain('Hostinger');
  });
});
