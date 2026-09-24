import { getPublicAssetUrl } from './publicAsset';

describe('getPublicAssetUrl', () => {
  const originalPublicUrl = process.env.PUBLIC_URL;

  afterEach(() => {
    process.env.PUBLIC_URL = originalPublicUrl;
  });

  it('returns public asset paths unchanged when no public url is configured', () => {
    delete process.env.PUBLIC_URL;

    expect(getPublicAssetUrl('/photo/logo-cropped.png')).toBe('/photo/logo-cropped.png');
    expect(getPublicAssetUrl('photo/logo-cropped.png')).toBe('/photo/logo-cropped.png');
  });

  it('prefixes relative public assets with the configured public url', () => {
    process.env.PUBLIC_URL = '/econnect';

    expect(getPublicAssetUrl('/photo/logo-cropped.png')).toBe('/econnect/photo/logo-cropped.png');
  });

  it('supports absolute public urls', () => {
    process.env.PUBLIC_URL = 'https://cdn.example.com/econnect';

    expect(getPublicAssetUrl('/photo/logo-cropped.png')).toBe('https://cdn.example.com/econnect/photo/logo-cropped.png');
  });

  it('keeps root deployments on a single leading slash', () => {
    process.env.PUBLIC_URL = '/';

    expect(getPublicAssetUrl('/photo/logo-cropped.png')).toBe('/photo/logo-cropped.png');
  });

  it('supports protocol-relative public urls', () => {
    process.env.PUBLIC_URL = '//cdn.example.com/econnect';

    expect(getPublicAssetUrl('/photo/logo-cropped.png')).toBe('//cdn.example.com/econnect/photo/logo-cropped.png');
  });

  it('preserves absolute remote asset urls', () => {
    expect(getPublicAssetUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
  });
});
