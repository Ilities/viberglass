import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { formatAutoFixStatus, formatSeverity, formatTimestamp, getRecentTickets } from '@/data'
import { FunnelIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'

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
            <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <Input
              type="search"
              placeholder="Search tickets..."
              className="pl-10"
              name="search"
              defaultValue={search}
            />
          </div>
        </div>
        <Select name="status" defaultValue={status}>
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="in_progress">In Progress</option>
        </Select>
        <Select name="severity" defaultValue={severity}>
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Button plain>
          <FunnelIcon className="h-5 w-5" />
          Filters
        </Button>
      </div>

      <Table className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <TableHead>
          <TableRow>
            <TableHeader>Title</TableHeader>
            <TableHeader>Severity</TableHeader>
            <TableHeader>Category</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Auto-Fix</TableHeader>
            <TableHeader>Reported</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredTickets.map((ticket) => (
            <TableRow key={ticket.id} href={`/project/${project}/tickets/${ticket.id}`}>
              <TableCell className="font-medium">{ticket.title}</TableCell>
              <TableCell>
                <Badge className={formatSeverity(ticket.severity).color}>{formatSeverity(ticket.severity).label}</Badge>
              </TableCell>
              <TableCell>{ticket.category}</TableCell>
              <TableCell>
                <Badge
                  className={
                    ticket.status === 'resolved'
                      ? 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200'
                      : ticket.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-zinc-200'
                  }
                >
                  {ticket.status === 'in_progress'
                    ? 'In Progress'
                    : ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell>
                {ticket.autoFixStatus ? (
                  <Badge className={formatAutoFixStatus(ticket.autoFixStatus).color}>
                    {formatAutoFixStatus(ticket.autoFixStatus).label}
                  </Badge>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">{formatTimestamp(ticket.timestamp)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {filteredTickets.length === 0 && (
        <div className="mt-8 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No tickets found matching your criteria.</p>
        </div>
      )}
    </>
  )
}
