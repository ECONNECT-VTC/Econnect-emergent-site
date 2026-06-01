import React from 'react';

const LogoDisplay = ({ className = '', alt = 'Logo ECONNECT VTC', priority = false, scaled = true }) => (
  <span className={`inline-flex items-center overflow-hidden ${className}`}>
    <img
      src="/photo/logo.png"
      alt={alt}
      className={`h-full w-auto object-contain ${scaled ? 'scale-110 origin-center' : ''}`}
      loading={priority ? 'eager' : 'lazy'}
    />
  </span>
);

export default LogoDisplay;
