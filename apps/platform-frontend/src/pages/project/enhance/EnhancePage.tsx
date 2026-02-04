import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { formatAutoFixStatus, formatSeverity, getClankersList, getTicketDetails } from '@/data'
import type { Clanker, Ticket } from '@viberglass/types'
import { ClockIcon } from '@radix-ui/react-icons'
import { useParams, useSearchParams } from 'react-router-dom'
import { EnhanceForm } from './EnhanceForm'
import { useEffect, useState } from 'react'

export function EnhancePage() {
  const { project } = useParams<{ project: string }>()
  const [searchParams] = useSearchParams()
  const ticketId = searchParams.get('id')

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [isLoading, setIsLoading] = useState(!!ticketId)

  useEffect(() => {
    if (!ticketId) return

    async function loadData() {
      const [t, c] = await Promise.all([
        getTicketDetails(ticketId!),
        getClankersList(),
      ])

      if (!t) {
        setIsLoading(false)
        return
      }

      setTicket(t)
      setClankers(c)
      setIsLoading(false)
    }
    loadData()
  }, [ticketId])

  if (!ticketId) {
    return (
      <>
        <Heading>Enhance & Auto-Fix</Heading>
        <div className="mt-8 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">Select a ticket to enhance and auto-fix.</p>
          <div className="mt-4">
            <Button href={`/project/${project}/tickets`} color="brand">
              Browse Tickets
            </Button>
          </div>
        </div>
      </>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!ticket) {
    return null
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Heading>Enhance & Auto-Fix</Heading>
        <Badge className={formatSeverity(ticket.severity).color}>{formatSeverity(ticket.severity).label}</Badge>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <Subheading>Original Ticket</Subheading>
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
            <h3 className="font-semibold text-zinc-900 dark:text-white">{ticket.title}</h3>
            <p className="mt-2 text-zinc-700 dark:text-zinc-300">{ticket.description}</p>
            <div className="mt-4 flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
              <span>Category: {ticket.category}</span>
              <span>Reported: {new Date(ticket.timestamp).toLocaleString()}</span>
            </div>
          </div>

          <Subheading className="mt-8">Technical Context</Subheading>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="text-sm font-medium text-zinc-900 dark:text-white">Browser & Environment</div>
              <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {ticket.metadata.browser?.name} {ticket.metadata.browser?.version} on {ticket.metadata.os?.name}{' '}
                {ticket.metadata.os?.version}
              </div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Screen: {ticket.metadata.screen?.width}×{ticket.metadata.screen?.height} | Viewport:{' '}
                {ticket.metadata.screen?.viewportWidth}×{ticket.metadata.screen?.viewportHeight}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="text-sm font-medium text-zinc-900 dark:text-white">Page Context</div>
              <div className="mt-2 text-sm break-all text-zinc-600 dark:text-zinc-400">
                URL: {ticket.metadata.pageUrl}
              </div>
              {ticket.metadata.referrer && (
                <div className="mt-1 text-sm break-all text-zinc-600 dark:text-zinc-400">
                  Referrer: {ticket.metadata.referrer}
                </div>
              )}
            </div>

            {ticket.metadata.errors && ticket.metadata.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
                <div className="text-sm font-medium text-red-900 dark:text-red-200">JavaScript Errors</div>
                <div className="mt-2 space-y-2">
                  {ticket.metadata.errors.slice(0, 3).map((error, index) => (
                    <div key={index} className="text-sm text-red-800 dark:text-red-200">
                      {error.message}
                    </div>
                  ))}
                  {ticket.metadata.errors.length > 3 && (
                    <div className="text-sm text-red-600 dark:text-red-300">
                      +{ticket.metadata.errors.length - 3} more errors
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <Subheading>Enhance External Ticket</Subheading>
          <div className="mt-4">
            <EnhanceForm ticket={ticket} clankers={clankers} project={project!} />
          </div>

          {ticket.autoFixStatus && (
            <div className="mt-8">
              <Subheading>Auto-Fix Status</Subheading>
              <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <ClockIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-white">
                      <Badge className={formatAutoFixStatus(ticket.autoFixStatus).color}>
                        {formatAutoFixStatus(ticket.autoFixStatus).label}
                      </Badge>
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      {ticket.autoFixStatus === 'completed' && ticket.pullRequestUrl && (
                        <a href={ticket.pullRequestUrl} className="text-amber-600 hover:underline dark:text-amber-400">
                          View Pull Request
                        </a>
                      )}
                      {ticket.autoFixStatus === 'in_progress' && 'AI agent is working on this issue...'}
                      {ticket.autoFixStatus === 'failed' &&
                        'Auto-fix attempt failed. Manual intervention may be required.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
