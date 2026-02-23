import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { getTicketDetails } from '@/data'
import { apiFetch } from '@/service/api/client'
import type { Ticket } from '@viberglass/types'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

export function TicketMediaPage() {
  const { project, id } = useParams<{ project: string; id: string }>()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false)
  const [screenshotError, setScreenshotError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      const t = await getTicketDetails(id!)
      if (!t) {
        setIsLoading(false)
        return
      }
      setTicket(t)
      setIsLoading(false)
    }
    loadData()
  }, [id])

  useEffect(() => {
    let objectUrl: string | null = null

    async function loadScreenshot() {
      if (!ticket?.screenshot?.url) {
        setScreenshotUrl(null)
        return
      }

      setIsScreenshotLoading(true)
      setScreenshotError(null)

      try {
        const response = await apiFetch(ticket.screenshot.url)
        if (!response.ok) {
          throw new Error(`Failed to load screenshot (status ${response.status})`)
        }
        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        setScreenshotUrl(objectUrl)
      } catch {
        setScreenshotUrl(null)
        setScreenshotError('Failed to load screenshot')
      } finally {
        setIsScreenshotLoading(false)
      }
    }

    void loadScreenshot()

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [ticket?.screenshot?.url])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!ticket || !ticket.screenshot) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">No media available</div>
      </div>
    )
  }

  return (
    <>
      <PageMeta title={ticket ? `#${ticket.id.slice(-4)} | Media` : 'Media'} />
      <div className="flex items-center gap-4">
        <Button href={`/project/${project}/tickets/${id}`} plain>
          <ArrowLeftIcon className="h-5 w-5" />
          Back to Ticket
        </Button>
      </div>

      <div className="mt-8">
        <Heading>{ticket.title}</Heading>
        <div className="mt-4 flex items-center gap-4">
          <Badge className="bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            {ticket.category}
          </Badge>
        </div>
      </div>

      <div className="mt-8">
        <Subheading>Screenshot</Subheading>
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          {isScreenshotLoading && (
            <div className="text-zinc-500 dark:text-zinc-400">Loading screenshot...</div>
          )}
          {!isScreenshotLoading && screenshotError && (
            <div className="text-red-600 dark:text-red-400">{screenshotError}</div>
          )}
          {!isScreenshotLoading && !screenshotError && screenshotUrl && (
            <img
              src={screenshotUrl}
              alt="Ticket screenshot"
              className="max-w-full rounded-lg"
            />
          )}
        </div>
      </div>
    </>
  )
}
