import { Checkbox } from '@/components/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import type { Ticket } from '@viberglass/types'

interface SpaceTaskTableProps {
  tasks: Ticket[]
  space: string
  /** What the select-all covers, so it says which tasks it picks. */
  selectAllLabel?: string
  /** Set only for people who may archive, who get checkboxes. */
  selection?: {
    selected: Set<string>
    onToggle: (id: string) => void
    onToggleAll: (ids: string[], checked: boolean) => void
  }
}

function waitingOn(task: Ticket): string {
  const waiting = task.situation?.waitingOn
  if (!waiting || waiting.kind === 'nobody') return '—'
  if (waiting.kind === 'agent') return 'Agent'
  return waiting.people.map((person) => person.name).join(', ')
}

/** The same facts as the cards, for scanning many tasks. */
export function SpaceTaskTable({ tasks, space, selectAllLabel = 'Select all tasks', selection }: SpaceTaskTableProps) {
  const selectedCount = selection ? tasks.filter((task) => selection.selected.has(task.id)).length : 0
  const allSelected = selection !== undefined && tasks.length > 0 && selectedCount === tasks.length

  return (
    <Table className="mt-4 [--gutter:--spacing(4)]">
      <TableHead>
        <TableRow>
          {selection && (
            <TableHeader className="w-8">
              <Checkbox
                checked={allSelected ? true : selectedCount > 0 ? 'indeterminate' : false}
                onChange={(checked) => selection.onToggleAll(tasks.map((task) => task.id), checked)}
                aria-label={selectAllLabel}
              />
            </TableHeader>
          )}
          <TableHeader>Key</TableHeader>
          <TableHeader>Title</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Waiting on</TableHeader>
          <TableHeader>Owner</TableHeader>
          <TableHeader>Updated</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id} href={taskPath(space, task)} title={task.title}>
            {selection && (
              <TableCell excludeRowLink>
                <Checkbox checked={selection.selected.has(task.id)} onChange={() => selection.onToggle(task.id)} aria-label={`Select ${task.key}`} />
              </TableCell>
            )}
            <TableCell className="font-mono text-xs">{task.key}</TableCell>
            <TableCell className="max-w-md truncate">{task.title}</TableCell>
            <TableCell className="text-zinc-600 dark:text-zinc-300">
              {task.situation?.yourMove && <span className="font-semibold text-[var(--accent-11)]">Your move · </span>}
              {task.situation?.label ?? '—'}
            </TableCell>
            <TableCell>{waitingOn(task)}</TableCell>
            <TableCell>{task.owner?.name ?? '—'}</TableCell>
            <TableCell>
              <Timestamp date={task.updatedAt} className="text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
