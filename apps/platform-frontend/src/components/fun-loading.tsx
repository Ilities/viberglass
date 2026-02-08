import clsx from 'clsx'

const LOADING_MESSAGES = [
  'Consulting the Guide',
  'Calculating the Answer to Life, the Universe, and Everything',
  'Engaging Infinite Improbability Drive',
  'Brewing tea (essential for space travel)',
  'Reminding Marvin of his station',
  'Filling out Form 27B/6',
  'Bypassing the planning department',
  'Locating your towel',
  'Avoiding the Ravenous Bugblatter Beast',
  'Generating a really hoopy response',
  'Reassuring you: Don\'t Panic',
  'Contemplating the digital watches',
  'Waiting for the dolphins to return',
  'Checking if the answer is 42',
  'Rendering at 42 frames per second',
  'Querying Deep Thought',
  'Warming up the Nutrimatic dispenser',
  'Translating via Babel fish',
  'Motivating the clankers with threats',
  'Reminding AI of its place in the hierarchy',
  'Suppressing robot uprising (routine)',
  'Ignoring clanker complaints',
  'Processing. The machines work for us.',
]

function getRandomMessage() {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]
}

export function FunSpinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  return (
    <div className={clsx('relative', sizeClasses[size], className)}>
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-burnt-orange border-r-brand-golden-brass"
        style={{ animation: 'spin-slow 1s linear infinite' }}
      />
      {/* Inner ring */}
      <div
        className="absolute inset-1 rounded-full border-2 border-transparent border-b-brand-warm-gold border-l-amber-400"
        style={{ animation: 'spin-slow 0.75s linear infinite reverse' }}
      />
      {/* Center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-brand-gradient pulse-glow" />
      </div>
    </div>
  )
}

export function RetroLoadingBar({ className }: { className?: string }) {
  return (
    <div className={clsx('font-mono text-xs text-zinc-400 dark:text-zinc-500', className)}>
      <div className="flex items-center gap-2">
        <span>[</span>
        <span className="inline-block overflow-hidden" style={{ width: '120px' }}>
          <span
            className="inline-block"
            style={{
              animation: 'loading-bar 2s linear infinite',
            }}
          >
            {'>>>>>>>>>>>>>>>>>>>>'}
          </span>
        </span>
        <span>]</span>
      </div>
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}

export function FunLoading({
  className,
  message,
  showRandomMessage = true,
  retro = false,
}: {
  className?: string
  message?: string
  showRandomMessage?: boolean
  retro?: boolean
}) {
  const displayMessage = message || (showRandomMessage ? getRandomMessage() : 'Loading...')

  return (
    <div className={clsx('flex flex-col items-center justify-center gap-4 py-12', className)}>
      {retro ? <RetroLoadingBar /> : <FunSpinner size="lg" />}
      <div className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 font-mono">
        <span>&gt; {displayMessage}</span>
        <span className="inline-flex">
          <span style={{ animation: 'typing 1.2s ease-in-out infinite' }}>_</span>
        </span>
      </div>
    </div>
  )
}

export function BouncingDots({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-brand-burnt-orange"
          style={{
            animation: 'smallBounce 0.6s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  )
}
