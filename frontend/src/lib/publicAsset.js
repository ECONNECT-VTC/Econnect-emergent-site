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

  const normalizedPath = assetPath.replace(/^\/+/, '');
  const publicUrl = process.env.PUBLIC_URL || '';

  if (!publicUrl) {
    return `/${normalizedPath}`;
  }

  if (ABSOLUTE_URL_PATTERN.test(publicUrl)) {
    return new URL(normalizedPath, `${publicUrl.replace(/\/?$/, '/')}`).toString();
  }

  return `${publicUrl.replace(/\/$/, '')}/${normalizedPath}`;
};

export default getPublicAssetUrl;
