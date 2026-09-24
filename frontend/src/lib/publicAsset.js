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

  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${process.env.PUBLIC_URL || ''}${normalizedPath}`;
};

export default getPublicAssetUrl;
