import clsx from 'clsx'
import { Children, Fragment, isValidElement, type ReactNode } from 'react'

/** Who holds the next move: the person reading, the agent, or nobody (the run is settled). */
export type HandoffOwner = 'you' | 'agent' | 'settled' | 'problem'

const OWNER_STYLE: Record<HandoffOwner, { rule: string; eyebrow: string }> = {
  // Orange, like the sidebar's "Awaiting review": amber is remapped to each space's accent colour.
  you: { rule: 'border-l-orange-500', eyebrow: 'text-orange-700 dark:text-orange-400' },
  agent: { rule: 'border-l-blue-500', eyebrow: 'text-blue-700 dark:text-blue-300' },
  settled: { rule: 'border-l-[var(--gray-8)]', eyebrow: 'text-[var(--gray-10)]' },
  problem: { rule: 'border-l-red-500', eyebrow: 'text-red-700 dark:text-red-300' },
}

interface HandoffCardProps {
  owner: HandoffOwner
  eyebrow: string
  title: string
  children?: ReactNode
  /** The moves on offer, stacked in the right-hand column. */
  actions?: ReactNode
}

/** The card a run ends on: whose move it is next, and the move itself. */
export function HandoffCard({ owner, eyebrow, title, children, actions }: HandoffCardProps) {
  const style = OWNER_STYLE[owner]
  const moves = Children.toArray(isValidElement<{ children?: ReactNode }>(actions) && actions.type === Fragment ? actions.props.children : actions)
  const hasMoves = moves.length > 0
  return (
    <section
      aria-label={eyebrow}
      className={clsx(
        'grid overflow-hidden rounded-lg border border-l-4 border-[var(--gray-6)] bg-[var(--gray-1)]',
        style.rule,
        hasMoves && 'md:grid-cols-[minmax(0,1fr)_15rem]'
      )}
    >
      <div className="min-w-0 p-5">
        <p className={clsx('text-[11px] font-semibold tracking-[0.12em] uppercase', style.eyebrow)}>{eyebrow}</p>
        <h2 className="mt-1.5 text-base font-semibold text-[var(--gray-12)]">{title}</h2>
        {children && <div className="mt-3 text-sm text-[var(--gray-11)]">{children}</div>}
      </div>
      {hasMoves && (
        <div className="flex flex-col justify-center gap-2 border-t border-[var(--gray-6)] bg-[var(--gray-2)] p-5 md:border-t-0 md:border-l">
          {moves}
        </div>
      )}
    </section>
  )
}
