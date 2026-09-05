import React from 'react';

interface FeaturedBadgeIconProps {
  className?: string;
  size?: number;
}

export const FeaturedBadgeIcon: React.FC<FeaturedBadgeIconProps> = ({ 
  className = "w-6 h-6", 
  size = 24 
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="badgeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <filter id="badgeGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#F59E0B" floodOpacity="0.4" />
        </filter>
      </defs>
      
      {/* Bottom Stack Layer */}
      <path 
        d="M16 28L5 22L16 16L27 22L16 28Z" 
        fill="url(#badgeGradient)" 
        opacity="0.4"
      />
      {/* Middle Stack Layer */}
      <path 
        d="M16 23L5 17L16 11L27 17L16 23Z" 
        fill="url(#badgeGradient)" 
        opacity="0.7"
      />
      {/* Top Main Shield */}
      <path 
        d="M16 18L5 12L16 6L27 12L16 18Z" 
        fill="url(#badgeGradient)"
        filter="url(#badgeGlow)"
      />
      {/* Star Emblem */}
      <path 
        d="M16 8.5L17.2 11L20 11.3L18 13.1L18.6 15.8L16 14.4L13.4 15.8L14 13.1L12 11.3L14.8 11L16 8.5Z" 
        fill="#FFFFFF" 
      />
    </svg>
  );
};