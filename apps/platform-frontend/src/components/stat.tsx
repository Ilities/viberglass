import { Badge } from '@/components/badge'
import { Divider } from '@/components/divider'

export function Stat({ title, value, change }: { title: string; value: string; change: string }) {
  // Easter egg: if value is 42, add special styling
  const isTheAnswer = value === '42'

  return (
    <div>
      <Divider />
      <div className="mt-6 text-lg/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">{title}</div>
      <div
        className={`mt-3 text-3xl/8 font-semibold sm:text-2xl/8 font-mono tabular-nums ${
          isTheAnswer
            ? 'text-brand-burnt-orange pulse-glow'
            : 'text-zinc-950 dark:text-white'
        }`}
        title={isTheAnswer ? 'The Answer to the Ultimate Question of Life, the Universe, and Everything' : undefined}
      >
        {value}
      </div>
      <div className="mt-3 text-sm/6 sm:text-xs/6">
        <Badge color={change.startsWith('+') ? 'lime' : 'pink'}>{change}</Badge>{' '}
        <span className="text-zinc-500 dark:text-zinc-400">from last week</span>
      </div>
    </div>
  )
}
