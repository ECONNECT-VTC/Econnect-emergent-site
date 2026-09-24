import { Users } from '@phosphor-icons/react';

export const PremiumLuggageIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className={className}
  >
    <path
      d="M8.5 7.25V6a3.5 3.5 0 0 1 7 0v1.25"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="4"
      y="7.25"
      width="16"
      height="12.75"
      rx="3"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="M9 12h6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

export const PremiumWifiIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className={className}
  >
    <path
      d="M4 9.75a12.06 12.06 0 0 1 16 0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.5 13.25a7.02 7.02 0 0 1 9 0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11 16.75a1.85 1.85 0 0 1 2 0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="19" r="1.35" fill="currentColor" />
  </svg>
);

const VehicleFeatureBadges = ({
  passengers,
  luggage,
  hasWifi,
  iconSize = 15,
  className = '',
  itemClassName = '',
  showWifiLabel = true,
}) => (
  <div className={`flex items-center gap-3 flex-wrap ${className}`}>
    <span className={`inline-flex items-center gap-1.5 ${itemClassName}`}>
      <Users size={iconSize} weight="fill" />
      {passengers}
    </span>
    <span className={`inline-flex items-center gap-1.5 ${itemClassName}`}>
      <PremiumLuggageIcon size={iconSize} />
      {luggage}
    </span>
    {hasWifi && (
      <span className={`inline-flex items-center gap-1.5 ${itemClassName}`}>
        <PremiumWifiIcon size={iconSize} />
        {showWifiLabel ? 'Wi‑Fi' : null}
      </span>
    )}
  </div>
);

export default VehicleFeatureBadges;
