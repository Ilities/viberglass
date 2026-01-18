import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { formatAutoFixStatus, formatSeverity, formatTicketSystem, getTicketDetails } from '@/data'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import { notFound } from 'next/navigation'

export default async function TicketDetailPage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id } = await params
  const ticket = await getTicketDetails(id)

  if (!ticket) {
    notFound()
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Button href={`/project/${project}/tickets/${id}`} plain>
          <ArrowLeftIcon className="h-5 w-5" />
          Back to Ticket
        </Button>
      </div>

      <div className="mt-8 flex items-start justify-between">
        <div className="flex-1">
          <Heading>{ticket.title}</Heading>
          <div className="mt-4 flex items-center gap-4">
            <Badge className={formatSeverity(ticket.severity).color}>{formatSeverity(ticket.severity).label}</Badge>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
              {ticket.category}
            </Badge>
            {ticket.externalTicketId && (
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200">
                {formatTicketSystem(ticket.ticketSystem)} #{ticket.externalTicketId}
              </Badge>
            )}
            {ticket.autoFixStatus && (
              <Badge className={formatAutoFixStatus(ticket.autoFixStatus).color}>
                {formatAutoFixStatus(ticket.autoFixStatus).label}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Subheading>Screenshots</Subheading>
          <div className="mt-4">Not implemented yet.</div>
        </div>
      </div>
    </>
  )
}
