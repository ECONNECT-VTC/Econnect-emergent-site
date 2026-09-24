const ABSOLUTE_URL_PATTERN = /^(?:[a-z]+:)?\/\//i;

export const getPublicAssetUrl = (assetPath = '') => {
  if (!assetPath) {
    return '';
  }

  if (
    ABSOLUTE_URL_PATTERN.test(assetPath) ||
    assetPath.startsWith('data:') ||
    assetPath.startsWith('blob:')
  ) {
    return assetPath;
  }

  if (!assetPath.startsWith('/')) {
    return assetPath;
  }

  const normalizedPath = assetPath.replace(/^\/+/, '');
  const publicUrl = process.env.PUBLIC_URL || '';

  if (!publicUrl) {
    return `/${normalizedPath}`;
  }

  if (publicUrl.startsWith('//')) {
    return `${publicUrl.replace(/\/$/, '')}/${normalizedPath}`;
  }

  if (ABSOLUTE_URL_PATTERN.test(publicUrl)) {
    return new URL(normalizedPath, `${publicUrl.replace(/\/?$/, '/')}`).toString();
  }

  const normalizedPublicUrl = publicUrl === '/' ? '' : publicUrl.replace(/\/$/, '');
  return `${normalizedPublicUrl}/${normalizedPath}`;
};

export default getPublicAssetUrl;
