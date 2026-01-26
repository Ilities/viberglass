import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { getClankersList, getRecentTickets } from '@/data'
import { getTickets } from '@/service/api/ticket-api'
import { CaretSortIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { TicketsTable } from './tickets-table'

export const generateStaticParams = async () => {
  return []
}

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { project } = await params
  const tickets = await getRecentTickets(project)
  const searchP = await searchParams

  // Fetch clankers and full tickets for the run modal
  const clankers = await getClankersList()
  const fullTickets = await getTickets({ projectSlug: project, limit: 50 }).catch(() => [])

  // Parse search params
  const status = searchP.status as string
  const severity = searchP.severity as string
  const search = searchP.search as string

  // Filter tickets based on search params
  const filteredTickets = tickets.filter((ticket) => {
    if (status && ticket.status !== status) return false
    if (severity && ticket.severity !== severity) return false
    if (search && !ticket.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <>
      <div className="flex items-end justify-between">
        <Heading>Tickets</Heading>
        <div className="flex gap-4">
          <Button href={`/project/${project}/enhance`}>Enhance & Auto-Fix</Button>
          <Button href={`/project/${project}/tickets/create`} color="brand">
            Create
          </Button>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <div className="min-w-75 flex-2">
          <div className="relative">
            <Input
              type="search"
              placeholder="Search tickets..."
              className="pl-10"
              name="search"
              defaultValue={search}
            />
            <MagnifyingGlassIcon className="absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          </div>
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
