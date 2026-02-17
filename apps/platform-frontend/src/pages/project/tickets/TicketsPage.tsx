import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { SearchInput } from '@/components/search-input'
import { Select } from '@/components/select'
import type { Clanker, TicketSummary } from '@/data'
import { getClankersList, getRecentTickets } from '@/data'
import { getTickets } from '@/service/api/ticket-api'
import { CaretSortIcon } from '@radix-ui/react-icons'
import type { Ticket } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { TicketsTable } from './tickets-table'

export function TicketsPage() {
  const { project } = useParams<{ project: string }>()
  const [searchParams] = useSearchParams()
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [fullTickets, setFullTickets] = useState<Ticket[]>([])
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const status = searchParams.get('status') ?? 'all'
  const severity = searchParams.get('severity') ?? 'all'
  const search = searchParams.get('search') ?? ''

  useEffect(() => {
    async function loadData() {
      if (!project) return
      const [t, c, ft] = await Promise.all([
        getRecentTickets(project),
        getClankersList(),
        getTickets({ projectSlug: project, limit: 50 }).catch(() => [] as Ticket[]),
      ])
      setTickets(t)
      setClankers(c)
      setFullTickets(ft)
      setIsLoading(false)
    }
    loadData()
  }, [project])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  const filteredTickets = tickets.filter((ticket) => {
    if (status !== 'all' && ticket.status !== status) return false
    if (severity !== 'all' && ticket.severity !== severity) return false
    return !(search && !ticket.title.toLowerCase().includes(search.toLowerCase()))
  })

  if (!project) {
    return null
  }

  return (
    <>
      <PageMeta title={project ? `${project} | Tickets` : 'Tickets'} />
      <div className="flex items-end justify-between">
        <Heading>Tickets</Heading>
        <Button href={`/project/${project}/tickets/create`} color="brand">
          Create
        </Button>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <div className="min-w-75 flex-2">
          <SearchInput placeholder="Search tickets..." name="search" defaultValue={search} />
        </div>
        <Select name="status" defaultValue={status}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="in_progress">In Progress</option>
        </Select>
        <Select name="severity" defaultValue={severity}>
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Button plain>
          <CaretSortIcon className="h-5 w-5" />
          Filters
        </Button>
      </div>

      {filteredTickets.length > 0 ? (
        <TicketsTable tickets={filteredTickets} fullTickets={fullTickets} clankers={clankers} project={project} />
      ) : (
        <div className="mt-8 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No tickets found matching your criteria.</p>
        </div>
      )}
    </>
  )
}
