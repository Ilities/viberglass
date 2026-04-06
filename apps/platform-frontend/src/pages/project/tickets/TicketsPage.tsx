import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { SearchInput } from '@/components/search-input'
import { SegmentedControl } from '@/components/segmented-control'
import { Select } from '@/components/select'
import { getClankersList } from '@/data'
import { archiveTickets, getTickets, unarchiveTickets } from '@/service/api/ticket-api'
import {
  TICKET_ARCHIVE_FILTER,
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type Clanker,
  type Severity,
  type Ticket,
  type TicketArchiveFilter,
  type TicketLifecycleStatus,
  type TicketWorkflowPhase,
} from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ticketWorkflowPhaseOrder } from './ticket-display'
import { TicketsBoard } from './tickets-board'
import { TicketsTable } from './tickets-table'

type StatusFilter = 'actionable' | 'all' | TicketLifecycleStatus
type PhaseFilter = 'all' | TicketWorkflowPhase
type TicketView = 'board' | 'table'
type TicketTab = 'active' | 'archived'

const allStatuses: TicketLifecycleStatus[] = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.IN_REVIEW,
  TICKET_STATUS.RESOLVED,
]

function isTicketLifecycleStatus(value: string): value is TicketLifecycleStatus {
  return value === TICKET_STATUS.OPEN || value === TICKET_STATUS.IN_PROGRESS || value === TICKET_STATUS.IN_REVIEW || value === TICKET_STATUS.RESOLVED
}

function isTicketWorkflowPhase(value: string): value is TicketWorkflowPhase {
  return (
    value === TICKET_WORKFLOW_PHASE.RESEARCH ||
    value === TICKET_WORKFLOW_PHASE.PLANNING ||
    value === TICKET_WORKFLOW_PHASE.EXECUTION
  )
}

function parseStatusFilter(value: string | null, defaultValue: StatusFilter): StatusFilter {
  if (!value) return defaultValue
  if (value === 'actionable' || value === 'all') return value
  if (isTicketLifecycleStatus(value)) return value
  return defaultValue
}

function parsePhaseFilter(value: string | null): PhaseFilter {
  if (!value) return 'all'
  if (isTicketWorkflowPhase(value)) return value
  return 'all'
}

function parseSeverity(value: string | null): Severity | 'all' {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value
  return 'all'
}

function parseView(value: string | null): TicketView {
  return value === 'table' ? 'table' : 'board'
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

function statusesFromFilter(filter: StatusFilter): TicketLifecycleStatus[] {
  if (filter === 'actionable') {
    return [TICKET_STATUS.OPEN, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.IN_REVIEW]
  }
  if (filter === 'all') {
    return allStatuses
  }
  return [filter]
}

function workflowPhasesFromFilter(filter: PhaseFilter): TicketWorkflowPhase[] | undefined {
  if (filter === 'all') return undefined
  return [filter]
}

function visiblePhasesFromFilter(filter: PhaseFilter): TicketWorkflowPhase[] {
  if (filter === 'all') return ticketWorkflowPhaseOrder
  return [filter]
}

export function TicketsPage() {
  const { project } = useParams<{ project: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab: TicketTab = searchParams.get('tab') === 'archived' ? 'archived' : 'active'
  const status = parseStatusFilter(searchParams.get('status'), tab === 'active' ? 'actionable' : 'all')
  const phase = parsePhaseFilter(searchParams.get('phase'))
  const severity = parseSeverity(searchParams.get('severity'))
  const view = parseView(searchParams.get('view'))
  const search = searchParams.get('search') ?? ''
  const page = parsePositiveInt(searchParams.get('page'), 1)
  const pageSize = parsePositiveInt(searchParams.get('pageSize'), 25)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isArchiveMutationPending, setIsArchiveMutationPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set())
  const [total, setTotal] = useState(0)
  const [reloadNonce, setReloadNonce] = useState(0)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const visibleStatuses = useMemo(() => statusesFromFilter(status), [status])
  const visiblePhases = useMemo(() => visiblePhasesFromFilter(phase), [phase])
  const selectedCount = selectedTicketIds.size
  const showArchived = tab === 'archived'
  const selectedTicketIdList = useMemo(() => Array.from(selectedTicketIds), [selectedTicketIds])
  const allVisibleSelected = tickets.length > 0 && tickets.every((ticket) => selectedTicketIds.has(ticket.id))

  function updateFilters(next: {
    page?: number
    pageSize?: number
    phase?: PhaseFilter
    search?: string
    severity?: Severity | 'all'
    status?: StatusFilter
    tab?: TicketTab
    view?: TicketView
  }) {
    const nextTab = next.tab ?? tab
    const nextStatus = next.status ?? status
    const nextPhase = next.phase ?? phase
    const nextSeverity = next.severity ?? severity
    const nextView = next.view ?? view
    const nextSearch = next.search ?? search
    const nextPage = next.page ?? page
    const nextPageSize = next.pageSize ?? pageSize
    const nextParams = new URLSearchParams()

    if (nextTab !== 'active') {
      nextParams.set('tab', nextTab)
    }
    if (nextSearch.trim()) {
      nextParams.set('search', nextSearch.trim())
    }

    const defaultStatusForTab: StatusFilter = nextTab === 'active' ? 'actionable' : 'all'
    if (nextStatus !== defaultStatusForTab) {
      nextParams.set('status', nextStatus)
    }
    if (nextPhase !== 'all') {
      nextParams.set('phase', nextPhase)
    }
    if (nextSeverity !== 'all') {
      nextParams.set('severity', nextSeverity)
    }
    if (nextView !== 'board') {
      nextParams.set('view', nextView)
    }
    if (nextPage !== 1) {
      nextParams.set('page', String(nextPage))
    }
    if (nextPageSize !== 25) {
      nextParams.set('pageSize', String(nextPageSize))
    }

    setSearchParams(nextParams)
  }

  useEffect(() => {
    async function loadClankers() {
      setClankers(await getClankersList())
    }

    void loadClankers()
  }, [])

  useEffect(() => {
    async function loadTickets() {
      if (!project) return

      setIsLoading(true)
      setError(null)

      const archivedMode: TicketArchiveFilter =
        tab === 'archived' ? TICKET_ARCHIVE_FILTER.ONLY : TICKET_ARCHIVE_FILTER.EXCLUDE

      try {
        const offset = (page - 1) * pageSize
        const response = await getTickets({
          projectSlug: project,
          limit: pageSize,
          offset,
          statuses: visibleStatuses,
          workflowPhases: workflowPhasesFromFilter(phase),
          archived: archivedMode,
          severity: severity === 'all' ? undefined : severity,
          search,
        })

        setTickets(response.tickets)
        setTotal(response.pagination.total)
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load tickets')
        setTickets([])
        setTotal(0)
      } finally {
        setIsLoading(false)
      }
    }

    void loadTickets()
  }, [page, pageSize, phase, project, reloadNonce, search, severity, tab, visibleStatuses])

  useEffect(() => {
    setSelectedTicketIds((previous) => {
      const visibleIds = new Set(tickets.map((ticket) => ticket.id))
      const next = new Set<string>()
      for (const id of previous) {
        if (visibleIds.has(id)) {
          next.add(id)
        }
      }
      return next
    })
  }, [tickets])

  async function runArchiveMutation(mode: 'archive' | 'unarchive', ticketIds: string[]) {
    if (ticketIds.length === 0) return

    setIsArchiveMutationPending(true)
    setError(null)

    try {
      if (mode === 'archive') {
        await archiveTickets(ticketIds)
      } else {
        await unarchiveTickets(ticketIds)
      }

      setSelectedTicketIds(new Set())
      setReloadNonce((previous) => previous + 1)
      updateFilters({ page: 1 })
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to update archive state')
    } finally {
      setIsArchiveMutationPending(false)
    }
  }

  function toggleTicketSelection(ticketId: string) {
    setSelectedTicketIds((previous) => {
      const next = new Set(previous)
      if (next.has(ticketId)) {
        next.delete(ticketId)
      } else {
        next.add(ticketId)
      }
      return next
    })
  }

  function goToPage(nextPage: number) {
    updateFilters({ page: Math.max(1, Math.min(totalPages, nextPage)) })
  }

  if (!project) return null

  return (
    <>
      <PageMeta title={`${project} | Tickets`} />
      <div className="flex items-end justify-between gap-4">
        <Heading>Tickets</Heading>
        <Button href={`/project/${project}/tickets/create`} color="brand">
          Create
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {tab === 'active' ? (
            <Button onClick={() => updateFilters({ tab: 'active', page: 1, status: 'actionable' })}>Active Queue</Button>
          ) : (
            <Button outline onClick={() => updateFilters({ tab: 'active', page: 1, status: 'actionable' })}>
              Active Queue
            </Button>
          )}
          {tab === 'archived' ? (
            <Button onClick={() => updateFilters({ tab: 'archived', page: 1, status: 'all' })}>Archived</Button>
          ) : (
            <Button outline onClick={() => updateFilters({ tab: 'archived', page: 1, status: 'all' })}>
              Archived
            </Button>
          )}
        </div>

        <SegmentedControl
          value={view}
          onChange={(nextValue) => updateFilters({ view: parseView(nextValue) })}
          options={[
            { value: 'board', label: 'Board' },
            { value: 'table', label: 'Table' },
          ]}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(18rem,1.7fr)_repeat(4,minmax(9rem,0.7fr))]">
        <div className="min-w-0">
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Search</label>
          <SearchInput
            placeholder="Search tickets..."
            name="search"
            value={search}
            onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</label>
          <Select name="status" value={status} onChange={(value) => updateFilters({ status: parseStatusFilter(value, status), page: 1 })}>
            <option value="actionable">Actionable</option>
            <option value="all">All Statuses</option>
            <option value={TICKET_STATUS.OPEN}>Open</option>
            <option value={TICKET_STATUS.IN_PROGRESS}>In Progress</option>
            <option value={TICKET_STATUS.IN_REVIEW}>In Review</option>
            <option value={TICKET_STATUS.RESOLVED}>Resolved</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Phase</label>
          <Select name="phase" value={phase} onChange={(value) => updateFilters({ phase: parsePhaseFilter(value), page: 1 })}>
            <option value="all">All Phases</option>
            <option value={TICKET_WORKFLOW_PHASE.RESEARCH}>Research</option>
            <option value={TICKET_WORKFLOW_PHASE.PLANNING}>Planning</option>
            <option value={TICKET_WORKFLOW_PHASE.EXECUTION}>Execution</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Severity</label>
          <Select name="severity" value={severity} onChange={(value) => updateFilters({ severity: parseSeverity(value), page: 1 })}>
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Per page</label>
          <Select
            name="page_size"
            value={String(pageSize)}
            onChange={(value) => updateFilters({ pageSize: parsePositiveInt(value, 25), page: 1 })}
          >
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {total} ticket{total === 1 ? '' : 's'} total
          {selectedCount > 0 ? ` • ${selectedCount} selected` : ''}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button plain disabled={tickets.length === 0 || allVisibleSelected} onClick={() => setSelectedTicketIds(new Set(tickets.map((ticket) => ticket.id)))}>
            Select Visible
          </Button>
          <Button plain disabled={selectedCount === 0} onClick={() => setSelectedTicketIds(new Set())}>
            Clear Selection
          </Button>
          {selectedCount > 0 ? (
            <Button
              plain
              disabled={isArchiveMutationPending}
              onClick={() => void runArchiveMutation(showArchived ? 'unarchive' : 'archive', selectedTicketIdList)}
            >
              {showArchived ? 'Unarchive Selected' : 'Archive Selected'}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-8 flex items-center justify-center py-20">
          <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
        </div>
      ) : tickets.length > 0 ? (
        <>
          {view === 'board' ? (
            <TicketsBoard
              tickets={tickets}
              clankers={clankers}
              project={project}
              selectedTicketIds={selectedTicketIds}
              showArchived={showArchived}
              isArchiveMutationPending={isArchiveMutationPending}
              visiblePhases={visiblePhases}
              visibleStatuses={visibleStatuses}
              onToggleTicketSelection={toggleTicketSelection}
              onArchiveTicket={(ticketId) => void runArchiveMutation('archive', [ticketId])}
              onUnarchiveTicket={(ticketId) => void runArchiveMutation('unarchive', [ticketId])}
            />
          ) : (
            <TicketsTable
              tickets={tickets}
              clankers={clankers}
              project={project}
              selectedTicketIds={selectedTicketIds}
              showArchived={showArchived}
              isArchiveMutationPending={isArchiveMutationPending}
              onToggleTicketSelection={toggleTicketSelection}
              onToggleAllTicketSelection={(checked) =>
                setSelectedTicketIds(checked ? new Set(tickets.map((ticket) => ticket.id)) : new Set())
              }
              onArchiveTicket={(ticketId) => void runArchiveMutation('archive', [ticketId])}
              onUnarchiveTicket={(ticketId) => void runArchiveMutation('unarchive', [ticketId])}
            />
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button plain disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              Previous
            </Button>
            <div className="px-2 text-sm text-zinc-500 dark:text-zinc-400">
              Page {Math.min(page, totalPages)} of {totalPages}
            </div>
            <Button plain disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Next
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-8 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No tickets found matching your criteria.</p>
        </div>
      )}
    </>
  )
}
