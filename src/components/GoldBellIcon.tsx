import React from 'react';

interface GoldBellIconProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}

export const GoldBellIcon: React.FC<GoldBellIconProps> = ({ size = 'md', className = '' }) => {
  const dimensions = {
    xs: 'w-5 h-5',
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    hero: 'w-44 h-44 sm:w-52 sm:h-52',
  }[size];

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${dimensions} ${className}`}>
      {size === 'hero' && (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-4 rounded-full bg-[#D4AF7C]/25 blur-3xl pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute inset-10 rounded-full bg-[#B79B6B]/30 blur-2xl pointer-events-none"
          />
        </>
      )}
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_14px_24px_rgba(0,0,0,0.65)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="bellBodyGrad" x1="40" y1="30" x2="155" y2="155" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFF5D6" />
            <stop offset="22%" stopColor="#E6C796" />
            <stop offset="52%" stopColor="#D4AF7C" />
            <stop offset="78%" stopColor="#9E7E4E" />
            <stop offset="100%" stopColor="#5E4728" />
          </linearGradient>
          <linearGradient id="bellRimGrad" x1="25" y1="130" x2="175" y2="165" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B79B6B" />
            <stop offset="30%" stopColor="#FFF3D1" />
            <stop offset="60%" stopColor="#D4AF7C" />
            <stop offset="100%" stopColor="#6D5330" />
          </linearGradient>
          <radialGradient id="bellUnderGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1E160C" />
            <stop offset="70%" stopColor="#3B2B17" />
            <stop offset="100%" stopColor="#7C613B" />
          </radialGradient>
          <radialGradient id="clapperGrad" cx="38%" cy="35%" r="62%">
            <stop offset="0%" stopColor="#FFF6DC" />
            <stop offset="45%" stopColor="#D4AF7C" />
            <stop offset="85%" stopColor="#85683C" />
            <stop offset="100%" stopColor="#4A371C" />
          </radialGradient>
          <linearGradient id="bellHighlight" x1="72" y1="44" x2="96" y2="138" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#FFF5D6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#D4AF7C" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g transform="rotate(-14 100 100)">
          {/* Top Ring / Crown */}
          <circle
            cx="100"
            cy="28"
            r="12"
            stroke="url(#bellRimGrad)"
            strokeWidth="7"
            fill="#0A0A0A"
          />
          <ellipse cx="100" cy="40" rx="16" ry="6" fill="url(#bellRimGrad)" />

          {/* Main Bell Dome */}
          <path
            d="M100 38 C68 38, 54 64, 48 104 C44 126, 33 138, 26 145 L174 145 C167 138, 156 126, 152 104 C146 64, 132 38, 100 38 Z"
            fill="url(#bellBodyGrad)"
          />

          {/* Specular Left-Center Highlight Streak */}
          <path
            d="M86 44 C70 52, 62 78, 56 116 C53 128, 46 137, 42 142 L68 142 C71 134, 74 122, 77 104 C81 74, 86 54, 94 44 Z"
            fill="url(#bellHighlight)"
          />

          {/* Decorative Mid-Groove Band */}
          <path
            d="M46 118 Q100 129 154 118"
            stroke="#FFF3D1"
            strokeOpacity="0.4"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M45 121 Q100 132 155 121"
            stroke="#5E4728"
            strokeOpacity="0.55"
            strokeWidth="2"
            fill="none"
          />

          {/* Bell Lip / Rim */}
          <ellipse cx="100" cy="147" rx="76" ry="16" fill="url(#bellRimGrad)" />

          {/* Bell Hollow Interior */}
          <ellipse cx="100" cy="150" rx="64" ry="12" fill="url(#bellUnderGrad)" />

          {/* 3D Clapper Sphere */}
          <circle cx="103" cy="156" r="16" fill="url(#clapperGrad)" />
          <circle cx="98" cy="151" r="4.5" fill="#FFFDF7" fillOpacity="0.65" />
        </g>
      </svg>
    </div>
  );
};
