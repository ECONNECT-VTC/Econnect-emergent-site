import React from 'react';
import getPublicAssetUrl from '@/lib/publicAsset';

const LogoDisplay = ({ className = '', alt = 'Logo ECONNECT VTC', priority = false }) => (
  <span className={`inline-flex items-center justify-center overflow-hidden shrink-0 ${className}`}>
    <img
      src={getPublicAssetUrl('/photo/logo-cropped.png')}
      alt={alt}
      className="h-full w-full object-contain"
      loading={priority ? 'eager' : 'lazy'}
    />
  </span>
);

export default LogoDisplay;
