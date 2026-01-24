export function Logo({ className, ...props }: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 180 28" {...props} className={className}>
      <defs>
        <linearGradient id="logoWaveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#d4520a"/>
          <stop offset="100%" stopColor="#e8923e"/>
        </linearGradient>
        <linearGradient id="logoBatonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8923e"/>
          <stop offset="100%" stopColor="#c9a869"/>
        </linearGradient>
      </defs>
      {/* Icon */}
      <g transform="translate(0, 2)">
        <path d="M 2,7 Q 6,4 10,7 T 18,7 T 22,7" stroke="url(#logoWaveGradient)" fill="none" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 2,12 Q 6,9 10,12 T 18,12 T 22,12" stroke="url(#logoWaveGradient)" fill="none" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
        <path d="M 2,17 Q 6,14 10,17 T 18,17 T 22,17" stroke="url(#logoWaveGradient)" fill="none" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
        <line x1="8" y1="16" x2="16" y2="8" stroke="url(#logoBatonGradient)" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="16" cy="8" r="2" fill="#e8923e"/>
        <circle cx="12" cy="12" r="1.5" fill="#f5e6d3"/>
      </g>
      {/* Wordmark */}
      <text x="30" y="20" fontFamily="system-ui, -apple-system, sans-serif" fontSize="18" fontWeight="800" letterSpacing="-0.5" fill="currentColor">
        VIBERGLASS
      </text>
    </svg>
  )
}
