import fs from 'fs';
import path from 'path';

describe('public head configuration', () => {
  it('defines the mobile viewport and yellow brand icon links', () => {
    const indexHtmlPath = path.resolve(__dirname, '../public/index.html');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

    expect(indexHtml).toContain('name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"');
    expect(indexHtml).toContain('name="theme-color" content="#D4AF37"');
    expect(indexHtml).toContain('rel="icon" type="image/svg+xml" href="%PUBLIC_URL%/favicon.svg"');
  });
});
