import clsx from 'clsx'
import { CoverFrame } from './cover-frame'

/** Radix scales an app's cover can take; each reads in light and dark. */
const APP_HUES = ['teal', 'violet', 'crimson', 'blue', 'grass', 'orange', 'cyan', 'plum', 'indigo', 'brown'] as const

/** The same app always gets the same hue. */
export function appHue(seed: string): (typeof APP_HUES)[number] {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return APP_HUES[hash % APP_HUES.length]
}

export type CoverStatusTone = 'live' | 'working' | 'failed' | 'preview' | 'idle'

const TONE_DOT: Record<CoverStatusTone, string> = {
  live: 'bg-[var(--grass-9)]',
  working: 'bg-[var(--amber-9)] motion-safe:animate-pulse',
  failed: 'bg-[var(--red-9)]',
  preview: 'bg-[var(--blue-9)]',
  idle: 'bg-[var(--gray-8)]',
}

export function StatusDot({ tone }: { tone: CoverStatusTone }) {
  return <span aria-hidden className={clsx('size-1.5 shrink-0 rounded-full', TONE_DOT[tone])} />
}

/** An app's cover: its name on its own hue, with what it's doing now. */
export function AppCover({
  name,
  seed,
  status,
  detail,
  size = 'card',
}: {
  name: string
  /** What picks the hue; the space id, so an app keeps its colour when renamed. */
  seed: string
  status?: { label: string; tone: CoverStatusTone }
  detail?: string
  size?: 'card' | 'thumb'
}) {
  const hue = appHue(seed)
  return (
    <CoverFrame>
      <div className="absolute inset-0 flex flex-col p-3" style={{ background: `var(--${hue}-3)`, color: `var(--${hue}-11)` }}>
        {size === 'card' && (
          <div className="flex items-center gap-1.5">
            {status && (
              <span className="flex h-5 items-center gap-1.5 rounded-full bg-[var(--color-panel-solid)] pr-2 pl-[7px] text-[11px] font-semibold text-[var(--gray-12)] shadow-[0_0_0_1px_var(--gray-a4)]">
                <StatusDot tone={status.tone} />
                {status.label}
              </span>
            )}
          </div>
        )}
        <p className={clsx('mt-auto line-clamp-2 font-display font-bold tracking-[-0.02em] text-balance', size === 'card' ? 'text-xl leading-[1.1]' : 'text-[9px] leading-tight')}>
          {name}
        </p>
        {detail && size === 'card' && <p className="mt-1 truncate font-mono text-[10px]" style={{ color: `var(--${hue}-10)` }}>{detail}</p>}
      </div>
    </CoverFrame>
  )
}
