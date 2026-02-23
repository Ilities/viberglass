import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { SearchInput } from '@/components/search-input'
import { Select } from '@/components/select'
import { getClankersList } from '@/data'
import { archiveTickets, getTickets, unarchiveTickets } from '@/service/api/ticket-api'
import {
  TICKET_ARCHIVE_FILTER,
  TICKET_STATUS,
  type Clanker,
  type Severity,
  type Ticket,
  type TicketArchiveFilter,
  type TicketLifecycleStatus,
} from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { TicketsTable } from './tickets-table'

type StatusFilter = 'actionable' | 'all' | TicketLifecycleStatus

function parseStatusFilter(value: string | null, defaultValue: StatusFilter): StatusFilter {
  if (!value) {
    return defaultValue
  }

  if (
    value === 'actionable' ||
    value === 'all' ||
    value === TICKET_STATUS.OPEN ||
    value === TICKET_STATUS.IN_PROGRESS ||
    value === TICKET_STATUS.RESOLVED
  ) {
    return value
  }

  return defaultValue
}

function parseSeverity(value: string | null): Severity | 'all' {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value
  }
  return 'all'
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}

function statusesFromFilter(filter: StatusFilter): TicketLifecycleStatus[] {
  if (filter === 'actionable') {
    return [TICKET_STATUS.OPEN, TICKET_STATUS.IN_PROGRESS]
  }
  if (filter === 'all') {
    return [TICKET_STATUS.OPEN, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.RESOLVED]
  }
  return [filter]
}

export function TicketsPage() {
  const { project } = useParams<{ project: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = searchParams.get('tab') === 'archived' ? 'archived' : 'active'
  const defaultStatus = tab === 'active' ? 'actionable' : 'all'
  const status = parseStatusFilter(searchParams.get('status'), defaultStatus)
  const severity = parseSeverity(searchParams.get('severity'))
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

  function updateFilters(next: {
    tab?: 'active' | 'archived'
    search?: string
    status?: StatusFilter
    severity?: Severity | 'all'
    page?: number
    pageSize?: number
  }) {
    const nextTab = next.tab ?? tab
    const nextSearch = next.search ?? search
    const nextStatus = next.status ?? status
    const nextSeverity = next.severity ?? severity
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

    if (nextSeverity !== 'all') {
      nextParams.set('severity', nextSeverity)
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
      const clankerData = await getClankersList()
      setClankers(clankerData)
    }

    void loadClankers()
  }, [])

  useEffect(() => {
    async function loadTickets() {
      if (!project) {
        return
      }

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
          statuses: statusesFromFilter(status),
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
  }, [page, pageSize, project, reloadNonce, search, severity, status, tab])

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

  const selectedCount = selectedTicketIds.size
  const showArchived = tab === 'archived'

  const selectedTicketIdList = useMemo(() => Array.from(selectedTicketIds), [selectedTicketIds])

  async function runArchiveMutation(mode: 'archive' | 'unarchive', ticketIds: string[]) {
    if (ticketIds.length === 0) {
      return
    }

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

  function goToPage(nextPage: number) {
    const boundedPage = Math.max(1, Math.min(totalPages, nextPage))
    updateFilters({ page: boundedPage })
  }

  if (!project) {
    return null
  }

  return (
    <>
      <PageMeta title={`${project} | Tickets`} />
      <div className="flex items-end justify-between">
        <Heading>Tickets</Heading>
        <Button href={`/project/${project}/tickets/create`} color="brand">
          Create
        </Button>
      </div>

      <div className="mt-6 flex gap-2">
        {tab === 'active' ? (
          <Button onClick={() => updateFilters({ tab: 'active', page: 1, status: 'actionable' })}>
            Active Queue
          </Button>
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

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="min-w-75 flex-2">
          <SearchInput
            placeholder="Search tickets..."
            name="search"
            value={search}
            onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
          />
        </div>

        <Select name="status" value={status} onChange={(value) => updateFilters({ status: value as StatusFilter, page: 1 })}>
          <option value="actionable">Actionable (Open + In Progress)</option>
          <option value="all">All Statuses</option>
          <option value={TICKET_STATUS.OPEN}>Open</option>
          <option value={TICKET_STATUS.IN_PROGRESS}>In Progress</option>
          <option value={TICKET_STATUS.RESOLVED}>Resolved</option>
        </Select>

        <Select
          name="severity"
          value={severity}
          onChange={(value) => updateFilters({ severity: value as Severity | 'all', page: 1 })}
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>

        <Select
          name="page_size"
          value={String(pageSize)}
          onChange={(value) => updateFilters({ pageSize: Number.parseInt(value, 10), page: 1 })}
        >
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </Select>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {total} ticket{total === 1 ? '' : 's'} total
          {selectedCount > 0 ? ` • ${selectedCount} selected` : ''}
        </div>

        {selectedCount > 0 ? (
          <div className="flex items-center gap-2">
            {showArchived ? (
              <Button
                plain
                disabled={isArchiveMutationPending}
                onClick={() => runArchiveMutation('unarchive', selectedTicketIdList)}
              >
                Unarchive Selected
              </Button>
            ) : (
              <Button
                plain
                disabled={isArchiveMutationPending}
                onClick={() => runArchiveMutation('archive', selectedTicketIdList)}
              >
                Archive Selected
              </Button>
            )}
          </div>
        ) : null}
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
          <TicketsTable
            tickets={tickets}
            clankers={clankers}
            project={project}
            selectedTicketIds={selectedTicketIds}
            showArchived={showArchived}
            isArchiveMutationPending={isArchiveMutationPending}
            onToggleTicketSelection={(ticketId) => {
              setSelectedTicketIds((previous) => {
                const next = new Set(previous)
                if (next.has(ticketId)) {
                  next.delete(ticketId)
                } else {
                  next.add(ticketId)
                }
                return next
              })
            }}
            onToggleAllTicketSelection={(checked) => {
              if (checked) {
                setSelectedTicketIds(new Set(tickets.map((ticket) => ticket.id)))
              } else {
                setSelectedTicketIds(new Set())
              }
            }}
            onArchiveTicket={(ticketId) => {
              void runArchiveMutation('archive', [ticketId])
            }}
            onUnarchiveTicket={(ticketId) => {
              void runArchiveMutation('unarchive', [ticketId])
            }}
          />

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
