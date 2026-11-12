import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { StackedRow, StackedRows } from '@/components/stacked-rows'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { PauseIcon, Pencil1Icon, PlayIcon, TrashIcon } from '@radix-ui/react-icons'
import { parseIntervalExpression, type ClawScheduleSummary } from '@viberglass/types'
import { describeCron } from './cronSchedule'

function formatExpression(s: ClawScheduleSummary): string {
  if (s.scheduleType === 'interval' && s.intervalExpression) {
    const parsed = parseIntervalExpression(s.intervalExpression)
    if (parsed) {
      const singular: Record<string, string> = { minutes: 'minute', hours: 'hour', days: 'day', weeks: 'week' }
      return parsed.value === 1 ? `Every ${singular[parsed.unit]}` : `Every ${parsed.value} ${parsed.unit}`
    }
    return s.intervalExpression
  }
  if (s.scheduleType === 'cron' && s.cronExpression) {
    const description = describeCron(s.cronExpression)
    return description ? `${description} (${s.timezone})` : s.cronExpression
  }
  return '—'
}

interface Props {
  schedules: ClawScheduleSummary[]
  whatItDoes: (schedule: ClawScheduleSummary) => string
  canChange: (schedule: ClawScheduleSummary) => boolean
  onEdit: (schedule: ClawScheduleSummary) => void
  onToggleActive: (schedule: ClawScheduleSummary) => void
  onDelete: (schedule: ClawScheduleSummary) => void
}

function ScheduleActions({ schedule: s, onEdit, onToggleActive, onDelete }: { schedule: ClawScheduleSummary } & Pick<Props, 'onEdit' | 'onToggleActive' | 'onDelete'>) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button plain aria-label={`Edit ${s.name}`} onClick={() => onEdit(s)}>
        <Pencil1Icon className="h-4 w-4" />
      </Button>
      <Button plain onClick={() => onToggleActive(s)} aria-label={`${s.isActive ? 'Pause' : 'Resume'} ${s.name}`} title={s.isActive ? 'Pause' : 'Resume'}>
        {s.isActive ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
      </Button>
      <Button surface color="red" aria-label={`Delete ${s.name}`} onClick={() => onDelete(s)}>
        <TrashIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}

const statusBadge = (s: ClawScheduleSummary) => <Badge color={s.isActive ? 'green' : 'zinc'}>{s.isActive ? 'Active' : 'Paused'}</Badge>
const lastRun = (s: ClawScheduleSummary) => (s.lastRunAt ? <Timestamp date={s.lastRunAt} /> : '—')

/** The space's schedules: a table, or a card each on a narrow screen. */
export function SchedulesList({ schedules, whatItDoes, canChange, ...actions }: Props) {
  const narrow = useMediaQuery('(max-width: 639px)')

  if (narrow) {
    return (
      <StackedRows aria-label="Schedules" className="mt-6">
        {schedules.map((s) => (
          <StackedRow
            key={s.id}
            title={s.name}
            subtitle={whatItDoes(s)}
            action={canChange(s) ? <ScheduleActions schedule={s} {...actions} /> : undefined}
            facts={[
              { label: 'Schedule', value: formatExpression(s), wide: true },
              { label: 'Status', value: statusBadge(s) },
              { label: 'Last run', value: lastRun(s) },
              { label: 'Runs / fails', value: `${s.runCount} / ${s.failureCount}` },
            ]}
          />
        ))}
      </StackedRows>
    )
  }

  return (
    <Table className="mt-6">
      <TableHead>
        <TableRow>
          <TableHeader>Name</TableHeader>
          <TableHeader>Does</TableHeader>
          <TableHeader>Schedule</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Last run</TableHeader>
          <TableHeader>Runs / fails</TableHeader>
          <TableHeader />
        </TableRow>
      </TableHead>
      <TableBody>
        {schedules.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="min-w-40 font-medium whitespace-normal text-zinc-950 dark:text-white">{s.name}</TableCell>
            <TableCell className="min-w-48 whitespace-normal text-zinc-500 dark:text-zinc-400">{whatItDoes(s)}</TableCell>
            <TableCell
              className="min-w-48 whitespace-normal text-zinc-500 dark:text-zinc-400"
              title={s.scheduleType === 'cron' ? (s.cronExpression ?? undefined) : undefined}
            >
              {formatExpression(s)}
            </TableCell>
            <TableCell>{statusBadge(s)}</TableCell>
            <TableCell className="text-zinc-500 dark:text-zinc-400">{lastRun(s)}</TableCell>
            <TableCell className="text-zinc-500 dark:text-zinc-400">
              {s.runCount} / {s.failureCount}
            </TableCell>
            <TableCell>{canChange(s) && <ScheduleActions schedule={s} {...actions} />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
