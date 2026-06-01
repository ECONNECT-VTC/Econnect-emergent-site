import React from 'react';

const LogoDisplay = ({ className = '', alt = 'Logo ECONNECT VTC', priority = false }) => (
  <span className={`inline-flex items-center justify-center overflow-hidden shrink-0 ${className}`}>
    <img
      src="/photo/logo-cropped.png"
      alt={alt}
      className="h-full w-full object-contain"
      loading={priority ? 'eager' : 'lazy'}
    />
  </span>
);

export default LogoDisplay;
