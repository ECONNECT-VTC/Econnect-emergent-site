import React from 'react';

const LogoDisplay = ({ className = '', alt = 'Logo ECONNECT VTC', priority = false }) => (
  <img
    src="/photo/logo.png"
    alt={alt}
    className={`w-auto object-contain ${className}`}
    loading={priority ? 'eager' : 'lazy'}
  />
);

export default LogoDisplay;
