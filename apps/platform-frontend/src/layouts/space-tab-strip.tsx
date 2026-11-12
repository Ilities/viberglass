import { Link } from '@/components/link'
import { cn } from '@/lib/utils'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpaceTab } from './spaceTabs'

const FADE = '2rem'

function edgeMask(start: boolean, end: boolean): string | undefined {
  if (!start && !end) return undefined
  return `linear-gradient(to right, ${start ? `transparent, black ${FADE}` : 'black'}, ${end ? `black calc(100% - ${FADE}), transparent` : 'black'})`
}

/** A space's tabs in one row; on a narrow screen it scrolls, fades at the edge with more tabs past it, and keeps the current tab in view. */
export function SpaceTabStrip({ tabs }: { tabs: SpaceTab[] }) {
  const strip = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })
  const current = tabs.find((tab) => tab.current)?.href

  const measure = useCallback(() => {
    const el = strip.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [])

  useEffect(() => {
    const el = strip.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('[aria-current="page"]')
    if (active) el.scrollLeft = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2
    measure()
  }, [current, tabs.length, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const mask = edgeMask(edges.start, edges.end)
  return (
    <div className="mt-4 border-b border-[var(--gray-5)]">
      <nav
        ref={strip}
        aria-label="Space"
        onScroll={measure}
        className="relative flex overflow-x-auto [scrollbar-width:none]"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.current ? 'page' : undefined}
            className={cn(
              'relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors first:-ml-3',
              tab.current ? 'text-[var(--gray-12)]' : 'text-[var(--gray-10)] hover:text-[var(--gray-12)]'
            )}
          >
            {tab.label}
            {tab.current && <span aria-hidden className="absolute right-3 bottom-0 left-3 h-0.5 rounded-full bg-[var(--accent-9)]" />}
          </Link>
        ))}
      </nav>
    </div>
  )
}
