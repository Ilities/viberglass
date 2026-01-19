import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableRow } from '@/components/table'
import { formatAutoFixStatus, formatSeverity, formatTicketSystem, getTicketDetails } from '@/data'
import { ArrowLeftIcon, EyeIcon, SparklesIcon } from '@heroicons/react/20/solid'
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
        <Button href={`/project/${project}/tickets`} plain>
          <ArrowLeftIcon className="h-5 w-5" />
          Back to Tickets
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
        <div className="flex gap-2">
          <Button href={`/project/${project}/enhance?id=${ticket.id}`} color="blue">
            <SparklesIcon className="h-5 w-5" />
            Enhance & Fix
          </Button>
          {ticket.screenshot && (
            <Button href={`/project/${project}/tickets/${ticket.id}/media`} plain>
              <EyeIcon className="h-5 w-5" />
              View Screenshots
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Subheading>Description</Subheading>
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
            <p className="text-zinc-700 dark:text-zinc-300">{ticket.description}</p>
          </div>

          {ticket.metadata.errors && ticket.metadata.errors.length > 0 && (
            <>
              <Subheading className="mt-8">JavaScript Errors</Subheading>
              <div className="mt-4 space-y-4">
                {ticket.metadata.errors.map((error, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10"
                  >
                    <div className="font-medium text-red-900 dark:text-red-200">{error.message}</div>
                    {error.stack && (
                      <pre className="mt-2 text-sm whitespace-pre-wrap text-red-700 dark:text-red-300">
                        {error.stack}
                      </pre>
                    )}
                    {error.filename && (
                      <div className="mt-2 text-sm text-red-600 dark:text-red-300">
                        {error.filename}:{error.lineno}:{error.colno}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {ticket.metadata.console && ticket.metadata.console.length > 0 && (
            <>
              <Subheading className="mt-8">Console Logs</Subheading>
              <div className="mt-4 space-y-2">
                {ticket.metadata.console.map((log, index) => (
                  <div
                    key={index}
                    className={`rounded p-3 text-sm ${
                      log.level === 'error'
                        ? 'bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-200'
                        : log.level === 'warn'
                          ? 'bg-yellow-50 text-yellow-900 dark:bg-yellow-500/10 dark:text-yellow-200'
                          : 'bg-gray-50 text-gray-900 dark:bg-white/10 dark:text-zinc-200'
                    }`}
                  >
                    <span className="font-medium uppercase">{log.level}:</span> {log.message}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <Subheading>Technical Details</Subheading>
          <Table className="mt-4">
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Browser</TableCell>
                <TableCell>
                  {ticket.metadata.browser?.name} {ticket.metadata.browser?.version}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">OS</TableCell>
                <TableCell>
                  {ticket.metadata?.os?.name} {ticket.metadata.os?.version}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Screen Size</TableCell>
                <TableCell>
                  {ticket.metadata.screen?.width}×{ticket.metadata.screen?.height}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Viewport</TableCell>
                <TableCell>
                  {ticket.metadata.screen?.viewportWidth}×{ticket.metadata.screen?.viewportHeight}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Page URL</TableCell>
                <TableCell className="break-all">{ticket.metadata.pageUrl}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Timestamp</TableCell>
                <TableCell>{new Date(ticket.metadata.timestamp).toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
