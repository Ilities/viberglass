import { Stat } from '@/app/stat'
import { Badge } from '@/components/badge'
import { Heading, Subheading } from '@/components/heading'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { formatSeverity, formatTicketSystem, formatTimestamp, getRecentTickets, getTicketStats } from '@/data'

export default async function Home({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  const [tickets, stats] = await Promise.all([getRecentTickets(project), getTicketStats()])

  return (
    <>
      <Heading>Good morning, Developer</Heading>
      <div className="mt-8 flex items-end justify-between">
        <Subheading>Overview</Subheading>
        <div>
          <Select name="period">
            <option value="last_week">Last week</option>
            <option value="last_two">Last two weeks</option>
            <option value="last_month">Last month</option>
            <option value="last_quarter">Last quarter</option>
          </Select>
        </div>
      </div>
      <div className="mt-4 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Total tickets" value={stats.total.toString()} change="+12.5%" />
        <Stat title="Open issues" value={stats.open.toString()} change="-2.1%" />
        <Stat title="Auto-fix requested" value={stats.autoFixStats.requested.toString()} change="+8.3%" />
        <Stat title="Resolved this week" value={stats.resolved.toString()} change="+15.2%" />
      </div>
      <Subheading className="mt-14">Recent tickets</Subheading>
      {/* Filter tickets based on search params */}
      {/*const filteredTickets = tickets.filter((ticket) => {
        // Use autoFixStatus or similar for status check if 'status' field is missing in TicketListItem
        if (search && !ticket.title.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })*/}

      <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <TableHead>
          <TableRow>
            <TableHeader>Title</TableHeader>
            <TableHeader>Severity</TableHeader>
            <TableHeader>Category</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Reported</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id} href={`/project/${project}/tickets/${ticket.id}`} title={`Ticket #${ticket.id}`}>
              <TableCell className="font-medium">{ticket.title}</TableCell>
              <TableCell>
                <Badge className={formatSeverity(ticket.severity).color}>{formatSeverity(ticket.severity).label}</Badge>
              </TableCell>
              <TableCell>{ticket.category}</TableCell>
              <TableCell>
                {ticket.id ? (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
                      {formatTicketSystem(ticket.ticketSystem)}
                    </Badge>
                    {ticket.autoFixStatus && (
                      <Badge
                        className={
                          ticket.autoFixStatus === 'completed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200'
                            : ticket.autoFixStatus === 'in_progress'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-zinc-200'
                        }
                      >
                        {ticket.autoFixStatus === 'in_progress'
                          ? 'In Progress'
                          : (ticket.autoFixStatus || 'Open').charAt(0).toUpperCase() +
                            (ticket.autoFixStatus || 'Open').slice(1)}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-zinc-200">
                    {ticket.status === 'in_progress' ? 'In Progress' : 'Open'}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">{formatTimestamp(ticket.timestamp)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
