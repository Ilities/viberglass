import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { SpacePageBar } from '@/components/space-page-bar'
import { PageMeta } from '@/components/page-meta'
import { StackedRow, StackedRows } from '@/components/stacked-rows'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { useProject } from '@/context/project-context'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { taskPath } from '@/lib/taskPath'
import { formatCostUsd } from '@/pages/project/tickets/comparison-facts'
import { getAgentTrackRecord } from '@/service/api/agent-track-record-api'
import { getAgentLabel, type AgentTrackRecord, type AgentTrackRecordEntry } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { MIN_TASKS_TO_SAY, summarize, taskFacts, type Ratio } from './track-record-summary'

const entryKey = (entry: AgentTrackRecordEntry) => `${entry.agent}:${entry.model ?? ''}`
const entryName = (entry: AgentTrackRecordEntry) => `${getAgentLabel(entry.agent)} · ${entry.model ?? 'its default model'}`
const ratio = ({ count, of }: Ratio) => (of === 0 ? '—' : `${count} of ${of}`)
const tooFewText = `Too few tasks to say (needs ${MIN_TASKS_TO_SAY})`

/** The columns after Tasks, or null while there are too few tasks to say. */
function metrics(entry: AgentTrackRecordEntry): Array<{ label: string; value: string }> | null {
  const summary = summarize(entry)
  if (summary.tasks < MIN_TASKS_TO_SAY) return null
  return [
    { label: 'Merged', value: ratio(summary.merged) },
    { label: 'Built from first plan', value: ratio(summary.builtFromFirstPlan) },
    { label: 'Questions', value: summary.questionsPerTask.toFixed(1) },
    { label: 'Taken over', value: ratio(summary.takenOver) },
    { label: 'Review comments', value: summary.reviewComments === null ? '—' : summary.reviewComments.toFixed(1) },
    {
      label: 'Cost per merge',
      value: summary.costPerMerge === null ? '—' : `${formatCostUsd(summary.costPerMerge)}${summary.costEstimated ? ' est.' : ''}`,
    },
  ]
}

function EntryRow({ entry, href }: { entry: AgentTrackRecordEntry; href: string }) {
  const facts = metrics(entry)
  return (
    <TableRow href={href}>
      <TableCell>
        <div className="font-medium text-[var(--gray-12)]">{getAgentLabel(entry.agent)}</div>
        <div className="text-xs text-[var(--gray-10)]">{entry.model ?? 'Its default model'}</div>
      </TableCell>
      <TableCell>{entry.tasks.length}</TableCell>
      {facts ? (
        facts.map((fact) => <TableCell key={fact.label}>{fact.value}</TableCell>)
      ) : (
        <TableCell colSpan={6} className="text-[var(--gray-10)]">
          {tooFewText}
        </TableCell>
      )}
    </TableRow>
  )
}

function EntryCard({ entry, href }: { entry: AgentTrackRecordEntry; href: string }) {
  const facts = metrics(entry)
  return (
    <StackedRow
      title={getAgentLabel(entry.agent)}
      subtitle={entry.model ?? 'Its default model'}
      href={href}
      facts={[
        { label: 'Tasks', value: entry.tasks.length },
        ...(facts ?? [{ label: 'Track record', value: <span className="text-[var(--gray-10)]">{tooFewText}</span> }]),
      ]}
    />
  )
}

function EntryTasks({ entry, space }: { entry: AgentTrackRecordEntry; space: string }) {
  return (
    <section aria-label={`${entryName(entry)}'s tasks`} className="mt-10">
      <h2 className="text-base font-semibold text-[var(--gray-12)]">
        {entryName(entry)} · {entry.tasks.length} {entry.tasks.length === 1 ? 'task' : 'tasks'}
      </h2>
      <ul className="mt-3 divide-y divide-[var(--gray-4)] text-sm">
        {entry.tasks.map((task) => (
          <li key={task.ticketId} className="flex items-baseline gap-3 py-2">
            <Link href={taskPath(space, { id: task.ticketId, key: task.key })} className="shrink-0 text-[var(--gray-10)] hover:text-[var(--accent-11)] hover:underline">
              {task.key}
            </Link>
            <span className="min-w-0 flex-1">
              <span className="text-[var(--gray-12)]">{task.title}</span>
              <span className="text-[var(--gray-10)]"> · {taskFacts(task).join(' · ')}</span>
            </span>
            {task.costUsd !== null && (
              <span className="shrink-0 text-[var(--gray-10)]">
                {formatCostUsd(task.costUsd)}
                {task.costEstimated ? ' est.' : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TrackRecordPage() {
  const { project } = useParams<{ project: string }>()
  const { project: space } = useProject()
  const [searchParams] = useSearchParams()
  const [record, setRecord] = useState<AgentTrackRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const narrow = useMediaQuery('(max-width: 639px)')

  useEffect(() => {
    if (!space) return
    let cancelled = false
    setLoadError(null)
    getAgentTrackRecord(space.id)
      .then((loaded) => !cancelled && setRecord(loaded))
      .catch((error: unknown) => !cancelled && setLoadError(error instanceof Error ? error.message : "Couldn't load the agents' track record"))
    return () => {
      cancelled = true
    }
  }, [space, reload])

  if (!project) return null
  const selected = record?.entries.find((entry) => entryKey(entry) === searchParams.get('agent'))

  return (
    <>
      <PageMeta title={`${space?.name ?? project} | Track record`} />
      <SpacePageBar description="How each agent's tasks in this space went, credited to the agent and model that built them. People choose which agent takes a task, so the one they trust may have the harder tasks." />

      {loadError ? (
        <div className="space-y-3 text-sm">
          <p className="text-red-700 dark:text-red-400">{loadError}</p>
          <Button outline onClick={() => setReload((count) => count + 1)}>
            Try again
          </Button>
        </div>
      ) : !record ? (
        <p className="text-sm text-[var(--gray-10)]">Loading…</p>
      ) : record.entries.length === 0 ? (
        <p className="text-sm text-[var(--gray-10)]">No agent has worked on a task in this space yet.</p>
      ) : (
        <>
          {narrow ? (
            <StackedRows aria-label="Agents' track record">
              {record.entries.map((entry) => (
                <EntryCard key={entryKey(entry)} entry={entry} href={`?agent=${encodeURIComponent(entryKey(entry))}`} />
              ))}
            </StackedRows>
          ) : (
            <Table className="[--gutter:--spacing(4)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Agent and model</TableHeader>
                  <TableHeader>Tasks</TableHeader>
                  <TableHeader>Merged</TableHeader>
                  <TableHeader>Built from first plan</TableHeader>
                  <TableHeader>Questions</TableHeader>
                  <TableHeader>Taken over</TableHeader>
                  <TableHeader>Review comments</TableHeader>
                  <TableHeader>Cost per merge</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {record.entries.map((entry) => (
                  <EntryRow key={entryKey(entry)} entry={entry} href={`?agent=${encodeURIComponent(entryKey(entry))}`} />
                ))}
              </TableBody>
            </Table>
          )}
          {selected && <EntryTasks entry={selected} space={project} />}
        </>
      )}
    </>
  )
}
