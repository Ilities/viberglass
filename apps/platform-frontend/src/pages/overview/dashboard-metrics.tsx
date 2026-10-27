import type { OverviewData } from '@viberglass/types'

/** A compact, labelled summary; the lists below contain the counted tasks. */
export function DashboardMetrics({ overview }: { overview: OverviewData }) {
  const metrics = [
    { label: 'Agents working', count: overview.liveNow.length, href: '#overview-liveNow' },
    { label: 'Waiting on people', count: overview.waiting.length, href: '#overview-waiting' },
    { label: 'Needs attention', count: overview.needsAttention.length, href: '#overview-needsAttention' },
    { label: 'Done in the last 7 days', count: overview.doneThisWeek.length, href: '#overview-outcomes' },
  ]
  return (
    <div aria-label="Work summary" className="mb-9 grid grid-cols-2 border-y border-[var(--gray-5)] sm:grid-cols-4">
      {metrics.map((metric) => (
        <a key={metric.label} href={metric.href} onClick={() => { const target = document.getElementById(metric.href.slice(1)); if (target instanceof HTMLDetailsElement) target.open = true }} className="min-w-0 border-[var(--gray-5)] py-4 pr-3 hover:bg-[var(--gray-2)] sm:border-l sm:px-4 sm:first:border-l-0 sm:first:pl-0">
          <span className="block text-2xl font-semibold tabular-nums text-[var(--gray-12)]">{metric.count}</span>
          <span className="text-xs text-[var(--gray-10)]">{metric.label}</span>
        </a>
      ))}
    </div>
  )
}
