import { Badge } from '@/components/badge'
import { Divider } from '@/components/divider'

export function Stat({ title, value, change }: { title: string; value: string; change: string }) {
  return (
    <div>
      <Divider />
      <div className="mt-6 text-lg/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">{title}</div>
      <div className="mt-3 text-3xl/8 font-semibold text-zinc-950 sm:text-2xl/8 dark:text-white">{value}</div>
      <div className="mt-3 text-sm/6 sm:text-xs/6">
        <Badge color={change.startsWith('+') ? 'lime' : 'pink'}>{change}</Badge>{' '}
        <span className="text-zinc-500 dark:text-zinc-400">from last week</span>
      </div>
    </div>
  )
}
