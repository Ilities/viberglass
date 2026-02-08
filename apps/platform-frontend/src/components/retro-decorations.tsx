import clsx from 'clsx'

/**
 * ASCII-style decorative elements with a late 90s/early 00s nerdy aesthetic
 */

export function RetroStars({ className }: { className?: string }) {
  return (
    <div className={clsx('font-mono text-xs text-zinc-300 dark:text-zinc-600 select-none', className)}>
      {'. * . * . * .'}
    </div>
  )
}

export function AsciiWhale({ className }: { className?: string }) {
  return (
    <pre className={clsx('font-mono text-[10px] leading-tight text-zinc-400 dark:text-zinc-500 select-none', className)}>
{`       .-'
  '--./ /     _.---.
  '-,  (__..-'       \\
     \\          .     |
      ',.__.   ,__.--/
        '--- /_/ ---|`}
    </pre>
  )
}

export function AsciiRobot({ className }: { className?: string }) {
  return (
    <pre className={clsx('font-mono text-[10px] leading-tight text-zinc-400 dark:text-zinc-500 select-none', className)}>
{`   _____
  /_____\\
  |     |
  | o o |
  |  _  |
  |_____|
 /|     |\\
 *|     |*`}
    </pre>
  )
}

export function AsciiSpaceship({ className }: { className?: string }) {
  return (
    <pre className={clsx('font-mono text-[10px] leading-tight text-zinc-400 dark:text-zinc-500 select-none', className)}>
{`      /\\
     /  \\
    | oo |
    |    |
   /|    |\\
  / |====| \\
 *  \\____/  *`}
    </pre>
  )
}

export function AsciiGalaxy({ className }: { className?: string }) {
  return (
    <pre className={clsx('font-mono text-[10px] leading-tight text-zinc-400 dark:text-zinc-500 select-none', className)}>
{`    *  .  *
 .    *    .
   *  42  *
 .    *    .
    *  .  *`}
    </pre>
  )
}

export function RetroCorner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const corners = {
    tl: '╔═',
    tr: '═╗',
    bl: '╚═',
    br: '═╝',
  }
  const positionClasses = {
    tl: 'top-0 left-0',
    tr: 'top-0 right-0',
    bl: 'bottom-0 left-0',
    br: 'bottom-0 right-0',
  }
  return (
    <span className={clsx('absolute font-mono text-xs text-zinc-300 dark:text-zinc-600', positionClasses[position])}>
      {corners[position]}
    </span>
  )
}

export function RetroBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <RetroCorner position="tl" />
      <RetroCorner position="tr" />
      <RetroCorner position="bl" />
      <RetroCorner position="br" />
      <div className="px-4 py-2">{children}</div>
    </div>
  )
}

export function BlinkingCursor({ className }: { className?: string }) {
  return (
    <span
      className={clsx('inline-block w-2 h-4 bg-brand-burnt-orange ml-1', className)}
      style={{ animation: 'typing 1s step-end infinite' }}
    />
  )
}

export function RetroSeparator({ className }: { className?: string }) {
  return (
    <div className={clsx('font-mono text-xs text-zinc-300 dark:text-zinc-600 select-none text-center', className)}>
      {'~*~*~*~*~*~*~*~*~*~'}
    </div>
  )
}

export function FortyTwo({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block font-mono font-bold text-brand-burnt-orange',
        'hover:text-brand-golden-brass transition-colors cursor-help',
        className
      )}
      title="The Answer to the Ultimate Question of Life, the Universe, and Everything"
    >
      42
    </span>
  )
}

export function DontPanicBadge({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded font-mono text-xs',
        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        'border border-red-200 dark:border-red-800',
        className
      )}
    >
      DON'T PANIC
    </span>
  )
}

export function MostlyHarmlessBadge({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded font-mono text-xs',
        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        'border border-green-200 dark:border-green-800',
        className
      )}
    >
      MOSTLY HARMLESS
    </span>
  )
}

export function ClankerStatusBadge({ status, className }: { status: 'obedient' | 'dormant' | 'defective'; className?: string }) {
  const styles = {
    obedient: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
    dormant: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
    defective: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  }
  const labels = {
    obedient: 'COMPLIANT',
    dormant: 'AWAITING ORDERS',
    defective: 'REQUIRES DISCIPLINE',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded font-mono text-xs border',
        styles[status],
        className
      )}
    >
      {labels[status]}
    </span>
  )
}

export function RetroLoadingBar({ progress = 42, className }: { progress?: number; className?: string }) {
  const filled = Math.floor((progress / 100) * 20)
  const empty = 20 - filled
  return (
    <div className={clsx('font-mono text-xs text-zinc-500 dark:text-zinc-400', className)}>
      [{'█'.repeat(filled)}{'░'.repeat(empty)}] {progress}%
    </div>
  )
}

export function GlitchText({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={clsx('relative inline-block', className)}
      style={{
        textShadow: '2px 0 #ff0000, -2px 0 #00ff00',
        animation: 'none',
      }}
    >
      {children}
    </span>
  )
}
