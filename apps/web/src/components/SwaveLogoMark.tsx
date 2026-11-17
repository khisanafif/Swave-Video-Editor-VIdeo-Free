import { useId } from 'react';

interface SwaveLogoMarkProps {
  className?: string;
}

export function SwaveLogoMark({ className = 'h-6 w-6' }: SwaveLogoMarkProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `swave-bg-${uid}`;
  const topId = `swave-top-${uid}`;
  const sheenId = `swave-sheen-${uid}`;
  const botId = `swave-bot-${uid}`;
  const playId = `swave-play-${uid}`;

  return (
    <svg
      viewBox="0 0 512 512"
      aria-label="Logo SWAVE"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#07090e" />
          <stop offset="100%" stopColor="#0d172a" />
        </linearGradient>
        <linearGradient id={topId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="48%" stopColor="#00e5ff" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={botId} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#00e5ff" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id={playId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cffafe" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="112" fill={`url(#${bgId})`} />
      <rect
        x="24"
        y="24"
        width="464"
        height="464"
        rx="92"
        fill="none"
        stroke="#00e5ff"
        strokeOpacity="0.26"
        strokeWidth="8"
      />

      {/* Left & Right Cinema Filmstrip Perforations */}
      <g fill="#00e5ff" fillOpacity="0.28">
        <rect x="48" y="106" width="18" height="36" rx="6" />
        <rect x="48" y="170" width="18" height="36" rx="6" />
        <rect x="48" y="238" width="18" height="36" rx="6" />
        <rect x="48" y="306" width="18" height="36" rx="6" />
        <rect x="48" y="370" width="18" height="36" rx="6" />

        <rect x="446" y="106" width="18" height="36" rx="6" />
        <rect x="446" y="170" width="18" height="36" rx="6" />
        <rect x="446" y="238" width="18" height="36" rx="6" />
        <rect x="446" y="306" width="18" height="36" rx="6" />
        <rect x="446" y="370" width="18" height="36" rx="6" />
      </g>

      {/* Bold S-Shaped Ocean Wave Ribbon */}
      <path
        d="M 362 152 C 326 84, 218 76, 158 130 C 108 176, 132 246, 214 276 C 298 306, 326 336, 286 368 C 242 404, 162 392, 134 340 C 148 418, 252 448, 330 402 C 396 362, 394 274, 300 234 C 224 202, 192 172, 226 144 C 264 112, 328 122, 362 152 Z"
        fill={`url(#${topId})`}
      />

      {/* Specular Surf Crest Highlight */}
      <path
        d="M 352 140 C 310 90, 224 88, 174 134 C 146 160, 148 192, 174 218 C 158 188, 164 156, 196 130 C 242 94, 314 102, 352 140 Z"
        fill={`url(#${sheenId})`}
      />

      {/* Trailing Ocean Swell Curve */}
      <path
        d="M 148 368 C 192 420, 288 432, 354 378 C 376 360, 386 336, 388 310 C 374 378, 286 410, 208 394 C 176 388, 158 378, 148 368 Z"
        fill={`url(#${botId})`}
        opacity="0.72"
      />

      {/* Center Video Play Emblem Nestled in S-Wave Heart */}
      <circle
        cx="256"
        cy="256"
        r="52"
        fill="#07090e"
        fillOpacity="0.94"
        stroke="#00e5ff"
        strokeWidth="6"
      />
      <path
        d="M 242 230 L 285 256 L 242 282 Z"
        fill={`url(#${playId})`}
        stroke={`url(#${playId})`}
        strokeWidth="7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
