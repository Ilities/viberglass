import { Stat } from '@/components/stat'
import { Badge } from '@/components/badge'
import { FunLoading } from '@/components/fun-loading'
import { Heading, Subheading } from '@/components/heading'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { formatSeverity, formatTicketSystem, formatTimestamp, getRecentTickets, getTicketStats } from '@/data'
import type { TicketSummary, TicketStats } from '@/data'
import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

function getGreeting(): string {
  const hour = new Date().getHours()
  const greetings = {
    morning: [
      'Don\'t Panic',
      'The Guide says you\'re doing fine',
      'Another day in this wholly remarkable universe',
      'Tea first, then bugs',
    ],
    afternoon: [
      'Time is an illusion',
      'Halfway through another improbable day',
      'The universe is big. Really big',
      'Mostly harmless progress',
    ],
    evening: [
      'The ships hung in the sky much as bricks don\'t',
      'Evening approaches with alarming regularity',
      'Almost time for a Pan Galactic Gargle Blaster',
      'The Answer is still 42',
    ],
    night: [
      'Share and Enjoy',
      'Life. Don\'t talk to me about life',
      'Here you are, brain the size of a planet',
      'So it goes, in the late hours',
    ],
  }

  let timeOfDay: keyof typeof greetings
  if (hour >= 5 && hour < 12) timeOfDay = 'morning'
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon'
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening'
  else timeOfDay = 'night'

  const options = greetings[timeOfDay]
  return options[Math.floor(Math.random() * options.length)]
}

export function ProjectHomePage() {
  const { project } = useParams<{ project: string }>()
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const [t, s] = await Promise.all([getRecentTickets(project!), getTicketStats(project!)])
      setTickets(t)
      setStats(s)
      setIsLoading(false)
    }
    loadData()
  }, [project])

  const [greeting] = useState(getGreeting)

  if (isLoading) {
    return <FunLoading retro />
  }

  return (
    <>
      <Heading className="bounce-in">{greeting}, Developer</Heading>
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
        <Stat title="Total tickets" value={stats?.total.toString() ?? '0'} change="+12.5%" />
        <Stat title="Open issues" value={stats?.open.toString() ?? '0'} change="-2.1%" />
        <Stat title="Auto-fix requested" value={stats?.autoFixStats.requested.toString() ?? '0'} change="+8.3%" />
        <Stat title="Resolved this week" value={stats?.resolved.toString() ?? '0'} change="+15.2%" />
      </div>
      <Subheading className="mt-14">Recent tickets</Subheading>

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
