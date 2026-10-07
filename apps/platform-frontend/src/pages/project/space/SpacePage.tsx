import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { ListPanel } from '@/components/list-panel'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { ProjectReadinessBanner } from '@/components/project-readiness'
import { SectionHeader } from '@/components/section-header'
import { SegmentedControl } from '@/components/segmented-control'
import { useProject } from '@/context/project-context'
import { archiveTickets, unarchiveTickets, type TicketListParams } from '@/service/api/ticket-api'
import { LockClosedIcon } from '@radix-ui/react-icons'
import { TICKET_ARCHIVE_FILTER, TICKET_STATUS, type Ticket } from '@viberglass/types'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { readFilters, SpaceFilterBar, writeFilters, type SpaceFilters } from './space-filters'
import { groupTasks, matchesSituationFilters, peopleIn, SPACE_GROUP_LABEL, type SpaceGroup } from './space-groups'
import { SpaceTaskRow } from './space-task-row'
import { SpaceTaskTable } from './space-task-table'
import { usePagedTasks, type PagedTasks } from './use-space-tasks'

const ACTIVE_STATUSES = [TICKET_STATUS.OPEN, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.IN_REVIEW]

function serverQuery(
  space: string,
  filters: Pick<SpaceFilters, 'search' | 'artifact' | 'severity'>,
  part: 'active' | 'done' | 'archived'
): TicketListParams {
  return {
    projectSlug: space,
    search: filters.search,
    workflowPhases: filters.artifact === 'all' ? undefined : [filters.artifact],
    severity: filters.severity === 'all' ? undefined : filters.severity,
    archived: part === 'archived' ? TICKET_ARCHIVE_FILTER.ONLY : TICKET_ARCHIVE_FILTER.EXCLUDE,
    statuses: part === 'active' ? ACTIVE_STATUSES : part === 'done' ? [TICKET_STATUS.RESOLVED] : undefined,
  }
}

function LoadMore({ list }: { list: PagedTasks }) {
  if (!list.hasMore) return null
  return (
    <Button plain className="mt-2" disabled={list.isLoading} onClick={list.loadMore}>
      Load more
    </Button>
  )
}

/** A space: its tasks, grouped by what happens next. */
export function SpacePage() {
  const { project: slug } = useParams<{ project: string }>()
  const { project: space } = useProject()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDone, setShowDone] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const filters = readFilters(searchParams)
  const showArchived = searchParams.get('archived') === '1'
  const view = searchParams.get('view') === 'table' ? 'table' : 'list'
  // Only the filters the server applies reload the lists; the rest narrow what's loaded.
  const { search, artifact, severity } = filters
  const queries = useMemo(() => {
    const server = { search, artifact, severity }
    return {
      active: serverQuery(slug ?? '', server, 'active'),
      done: serverQuery(slug ?? '', server, 'done'),
      archived: serverQuery(slug ?? '', server, 'archived'),
    }
  }, [slug, search, artifact, severity])

  const active = usePagedTasks(queries.active, 100, Boolean(slug) && !showArchived)
  const done = usePagedTasks(queries.done, 20, Boolean(slug) && !showArchived)
  const archived = usePagedTasks(queries.archived, 50, Boolean(slug) && showArchived)

  if (!slug) return null
  const access = space?.viewerAccess
  const canArchive = Boolean(access?.canMaintain)
  const lists = showArchived ? [archived] : [active, done]
  const loaded = lists.flatMap((list) => list.tasks)
  const shown = (tasks: Ticket[]) => tasks.filter((task) => matchesSituationFilters(task, filters))
  const groups = groupTasks(shown(active.tasks)).filter((group) => group.group !== 'done')
  const doneTasks = shown(done.tasks)
  const isLoading = lists.some((list) => list.isLoading && list.tasks.length === 0)
  const error = lists.find((list) => list.error)?.error
  const doneOpen = showDone || filters.state === 'done'

  const setParams = (next: URLSearchParams) => {
    setSelected(new Set())
    setSearchParams(next)
  }
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selection = (task: Ticket) =>
    canArchive ? { selected: selected.has(task.id), onToggle: () => toggle(task.id) } : undefined
  const tableSelection = canArchive ? { selected, onToggle: toggle } : undefined

  const archiveSelected = async () => {
    setArchiving(true)
    try {
      const ids = [...selected]
      if (showArchived) await unarchiveTickets(ids)
      else await archiveTickets(ids)
      toast.success(`${ids.length} task${ids.length === 1 ? '' : 's'} ${showArchived ? 'restored' : 'archived'}`)
      setSelected(new Set())
      for (const list of lists) list.reload()
    } catch (archiveError) {
      toast.error(archiveError instanceof Error ? archiveError.message : 'Failed to update the tasks')
    } finally {
      setArchiving(false)
    }
  }

  const rows = (tasks: Ticket[], group?: SpaceGroup) => (
    <ListPanel>
      {tasks.map((task) => (
        <SpaceTaskRow key={task.id} task={task} space={slug} selection={selection(task)} group={group} />
      ))}
    </ListPanel>
  )
  const list = (tasks: Ticket[], group?: SpaceGroup) =>
    view === 'table' ? <SpaceTaskTable tasks={tasks} space={slug} selection={tableSelection} /> : rows(tasks, group)
  const countLine = (count: number) => `${count} task${count === 1 ? '' : 's'}`
  const activeCount = groups.reduce((sum, group) => sum + group.tasks.length, 0)

  return (
    <>
      <PageMeta title={space?.name ?? slug} />
      <PageHeader
        eyebrow={`${space?.isPrivate ? 'Private' : 'Open'} space · ${space?.name ?? slug}`}
        title={
          <span className="flex items-center gap-2">
            {space?.name ?? slug}
            {space?.isPrivate && <LockClosedIcon aria-label="Private space" className="size-4 text-[var(--gray-10)]" />}
            {showArchived && <span className="text-[var(--gray-10)]"> · Archived</span>}
          </span>
        }
        description={
          isLoading
            ? undefined
            : showArchived
              ? 'Tasks put away. Restore one to bring it back.'
              : activeCount === 0
                ? 'Nothing in progress.'
                : `${countLine(activeCount)} in progress.`
        }
        actions={
          access?.canCreateTasks && (
            <Button href={`/spaces/${slug}/tasks/new`} color="brand">
              Create task
            </Button>
          )
        }
      />

      {space && access?.canMaintain && (
        <div className="mb-6 empty:hidden">
          <ProjectReadinessBanner projectId={space.id} firstTaskHref={`/spaces/${slug}/tasks/new`} />
        </div>
      )}

      <SpaceFilterBar
        filters={filters}
        onChange={(next) => setParams(writeFilters(searchParams, next))}
        people={peopleIn(loaded)}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {selected.size > 0 && (
            <>
              <span>{selected.size} selected</span>
              <Button plain disabled={archiving} onClick={() => void archiveSelected()}>
                {showArchived ? 'Restore' : 'Archive'}
              </Button>
              <Button plain onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </>
          )}
        </div>
        <SegmentedControl
          value={view}
          onChange={(value) => {
            const next = new URLSearchParams(searchParams)
            if (value === 'table') next.set('view', 'table')
            else next.delete('view')
            setSearchParams(next)
          }}
          options={[
            { value: 'list', label: 'List' },
            { value: 'table', label: 'Table' },
          ]}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="mt-8 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading tasks…</p>
      ) : showArchived ? (
        <section aria-label="Archived" className="mt-6">
          {archived.tasks.length === 0 ? (
            <p className="text-sm text-zinc-500">No archived tasks.</p>
          ) : (
            list(shown(archived.tasks))
          )}
          <LoadMore list={archived} />
        </section>
      ) : (
        <>
          {groups.length === 0 && doneTasks.length === 0 && (
            <p className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">No tasks here match.</p>
          )}
          {groups.map(({ group, tasks }) => (
            <section key={group} aria-labelledby={`space-group-${group}`} className="mt-8">
              <SectionHeader
                id={`space-group-${group}`}
                title={SPACE_GROUP_LABEL[group]}
                hint={countLine(tasks.length)}
              />
              {list(tasks, group)}
            </section>
          ))}
          <LoadMore list={active} />
          <section aria-label="Done" className="mt-8">
            <details open={doneOpen} onToggle={(event) => setShowDone(event.currentTarget.open)}>
              <summary className="cursor-pointer text-sm font-medium text-[var(--gray-12)]">
                Done and archived tasks
                {done.total > 0 && <span className="text-[var(--gray-10)]"> · {done.total} done</span>}
              </summary>
              <p className="mt-2 mb-3 text-sm text-[var(--gray-10)]">
                Completed work stays available here and in search.{' '}
                <Link href={`/spaces/${slug}?archived=1`} className="underline">
                  Archived tasks
                </Link>
              </p>
              {doneOpen && doneTasks.length > 0 && (
                <>
                  {list(doneTasks)}
                  <LoadMore list={done} />
                </>
              )}
            </details>
          </section>
        </>
      )}

      {showArchived && (
        <p className="mt-10 text-sm">
          <Link href={`/spaces/${slug}`} className="text-[var(--gray-10)] underline">
            Back to the space's tasks
          </Link>
        </p>
      )}
    </>
  )
}
