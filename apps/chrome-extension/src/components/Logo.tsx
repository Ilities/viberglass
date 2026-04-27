interface Props {
  className?: string;
}

export function Logo({ className }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="6" fill="#18181B" />
      <defs>
        <linearGradient id="logoWaveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#d4520a" />
          <stop offset="100%" stopColor="#e8923e" />
        </linearGradient>
        <linearGradient id="logoBatonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8923e" />
          <stop offset="100%" stopColor="#c9a869" />
        </linearGradient>
      </defs>
      <path
        d="M 6,11 Q 10,8 14,11 T 22,11 T 26,11"
        stroke="url(#logoWaveGradient)"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M 6,16 Q 10,13 14,16 T 22,16 T 26,16"
        stroke="url(#logoWaveGradient)"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M 6,21 Q 10,18 14,21 T 22,21 T 26,21"
        stroke="url(#logoWaveGradient)"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="12"
        y1="20"
        x2="20"
        y2="12"
        stroke="url(#logoBatonGradient)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="20" cy="12" r="2" fill="#e8923e" />
      <circle cx="16" cy="16" r="1.5" fill="#f5e6d3" />
    </svg>
  );
}
