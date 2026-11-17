import { useId } from 'react';

interface SwaveLogoMarkProps {
  className?: string;
}

export function SwaveLogoMark({ className = 'h-6 w-6' }: SwaveLogoMarkProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `swave-bg-${uid}`;
  const mainId = `swave-main-${uid}`;
  const subId = `swave-sub-${uid}`;
  const echoId = `swave-echo-${uid}`;

  return (
    <svg
      viewBox="0 0 512 512"
      aria-label="Logo SWAVE"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#07090e" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={mainId} x1="0" y1="0.2" x2="1" y2="0.8">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#00e5ff" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id={subId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={echoId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#22d3ee" />
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
        strokeWidth="10"
      />
      <path
        d="M 244 154 C 294 98, 374 106, 412 162 C 364 138, 304 136, 244 154 Z"
        fill={`url(#${echoId})`}
        opacity="0.92"
      />
      <path
        d="M 80 278 C 122 140, 214 108, 276 206 C 322 278, 386 270, 434 182 C 398 320, 298 332, 242 246 C 192 168, 128 194, 80 278 Z"
        fill={`url(#${mainId})`}
      />
      <path
        d="M 118 346 C 166 266, 224 274, 270 324 C 318 376, 380 358, 424 282 C 392 402, 300 422, 244 360 C 202 314, 160 318, 118 346 Z"
        fill={`url(#${subId})`}
        opacity="0.88"
      />
    </svg>
  );
}
