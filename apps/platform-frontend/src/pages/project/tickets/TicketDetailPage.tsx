import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { InfoItem } from '@/components/info-item'
import { Section } from '@/components/section'
import { formatTicketSystem, getClankersList, getTicketDetails } from '@/data'
import type { Clanker, Ticket } from '@viberglass/types'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  CubeIcon,
  ExternalLinkIcon,
  EyeOpenIcon,
  FileTextIcon,
  Pencil1Icon,
  StackIcon,
  TrashIcon,
} from '@radix-ui/react-icons'
import { useParams, useNavigate } from 'react-router-dom'
import { EnhanceFixButton } from './enhance-fix-button'
import { TicketRunButton } from './ticket-run-button'
import { useEffect, useState } from 'react'
import { deleteTicket, updateTicket } from '@/service/api/ticket-api'
import { toast } from 'sonner'
import { EditTicketDialog } from './edit-ticket-dialog'
import { DeleteTicketDialog } from './delete-ticket-dialog'

function formatTicketId(ticketId: string): string {
  if (ticketId.length <= 20) return ticketId
  return `${ticketId.slice(0, 8)}...${ticketId.slice(-6)}`
}

function getSeverityBadge(severity: string): { label: string; color: 'red' | 'amber' | 'green' | 'zinc' } {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', color: 'red' }
    case 'high':
      return { label: 'High', color: 'amber' }
    case 'medium':
      return { label: 'Medium', color: 'amber' }
    case 'low':
      return { label: 'Low', color: 'green' }
    default:
      return { label: 'Unknown', color: 'zinc' }
  }
}

function getAutoFixBadge(status?: string): { label: string; color: 'green' | 'amber' | 'red' | 'zinc' } {
  switch (status) {
    case 'completed':
      return { label: 'Fixed', color: 'green' }
    case 'in_progress':
      return { label: 'Fixing', color: 'amber' }
    case 'pending':
      return { label: 'Pending', color: 'amber' }
    case 'failed':
      return { label: 'Failed', color: 'red' }
    default:
      return { label: 'Not Requested', color: 'zinc' }
  }
}

export function TicketDetailPage() {
  const { project, id } = useParams<{ project: string; id: string }>()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  useEffect(() => {
    async function loadData() {
      if (!id) {
        setIsLoading(false)
        return
      }

      try {
        const [t, c] = await Promise.all([getTicketDetails(id), getClankersList()])
        if (!t) {
          setIsLoading(false)
          return
        }
        setTicket(t)
        setClankers(c)
      } finally {
        setIsLoading(false)
      }
    }
    void loadData()
  }, [id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--gray-9)]">Loading ticket details...</div>
      </div>
    )
  }

  if (!ticket || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600 dark:text-red-400">Ticket not found</div>
      </div>
    )
  }

  const severityBadge = getSeverityBadge(ticket.severity)
  const autoFixBadge = getAutoFixBadge(ticket.autoFixStatus)

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <Button href={`/project/${project}/tickets`} plain>
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Tickets
          </Button>
        </div>

        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-4)] to-[var(--accent-3)] text-[var(--accent-11)] shadow-sm">
                <FileTextIcon className="h-7 w-7" />
              </div>

              <div>
                <Heading className="text-2xl">{ticket.title}</Heading>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge color={severityBadge.color}>{severityBadge.label}</Badge>
                  <Badge color="blue">{ticket.category}</Badge>
                  <Badge color={autoFixBadge.color}>{autoFixBadge.label}</Badge>
                  {ticket.externalTicketId && (
                    <Badge color="violet">
                      {formatTicketSystem(ticket.ticketSystem)} #{ticket.externalTicketId}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {ticket.externalTicketUrl && (
                <Button href={ticket.externalTicketUrl} target="_blank" plain>
                  <ExternalLinkIcon className="h-4 w-4" />
                  External Ticket
                </Button>
              )}
              {ticket.screenshot && (
                <Button href={`/project/${project}/tickets/${ticket.id}/media`} plain>
                  <EyeOpenIcon className="h-4 w-4" />
                  View Screenshots
                </Button>
              )}
              <TicketRunButton ticket={ticket} clankers={clankers} project={project} />
              <EnhanceFixButton href={`/project/${project}/enhance?id=${ticket.id}`} />
              <Button onClick={() => setIsEditDialogOpen(true)} outline>
                <Pencil1Icon className="h-4 w-4" />
                Edit
              </Button>
              <Button onClick={() => setIsDeleteDialogOpen(true)} color="red">
                <TrashIcon className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>

        </div>

        <div className="flex-1 min-h-0">
          <div className="grid gap-6 lg:grid-cols-12 h-full">
            <div className="lg:col-span-4 xl:col-span-3 space-y-1">
              <div className="app-frame rounded-lg p-4">
                <Section title="Ticket Information">
                  <InfoItem
                    icon={<StackIcon className="h-4 w-4" />}
                    label="Ticket ID"
                    value={<span className="font-mono text-xs">{ticket.id}</span>}
                  />
                  <div className="h-px bg-[var(--gray-6)] mx-1" />
                  <InfoItem
                    icon={<FileTextIcon className="h-4 w-4" />}
                    label="Display ID"
                    value={formatTicketId(ticket.id)}
                  />
                  <div className="h-px bg-[var(--gray-6)] mx-1" />
                  <InfoItem
                    icon={<CubeIcon className="h-4 w-4" />}
                    label="Category"
                    value={ticket.category}
                  />
                  <div className="h-px bg-[var(--gray-6)] mx-1" />
                  <InfoItem
                    icon={<ExternalLinkIcon className="h-4 w-4" />}
                    label="Ticket System"
                    value={formatTicketSystem(ticket.ticketSystem)}
                  />
                </Section>
              </div>

              <div className="app-frame rounded-lg p-4">
                <Section title="Timeline">
                  <InfoItem
                    icon={<CalendarIcon className="h-4 w-4" />}
                    label="Created"
                    value={new Date(ticket.createdAt).toLocaleString()}
                  />
                  <div className="h-px bg-[var(--gray-6)] mx-1" />
                  <InfoItem
                    icon={<ClockIcon className="h-4 w-4" />}
                    label="Updated"
                    value={new Date(ticket.updatedAt).toLocaleString()}
                  />
                  <div className="h-px bg-[var(--gray-6)] mx-1" />
                  <InfoItem
                    icon={<ClockIcon className="h-4 w-4" />}
                    label="Reported"
                    value={ticket.metadata?.timestamp ? new Date(ticket.metadata.timestamp).toLocaleString() : '—'}
                  />
                </Section>
              </div>

              <div className="app-frame rounded-lg p-4">
                <Section title="Environment">
                  <InfoItem
                    icon={<CubeIcon className="h-4 w-4" />}
                    label="Browser"
                    value={`${ticket.metadata?.browser?.name || '-'} ${ticket.metadata?.browser?.version || ''}`.trim()}
                  />
                  <div className="h-px bg-[var(--gray-6)] mx-1" />
                  <InfoItem
                    icon={<CubeIcon className="h-4 w-4" />}
                    label="OS"
                    value={`${ticket.metadata?.os?.name || '-'} ${ticket.metadata?.os?.version || ''}`.trim()}
                  />
                  <div className="h-px bg-[var(--gray-6)] mx-1" />
                  <InfoItem
                    icon={<CubeIcon className="h-4 w-4" />}
                    label="Viewport"
                    value={
                      ticket.metadata?.screen
                        ? `${ticket.metadata.screen.viewportWidth}×${ticket.metadata.screen.viewportHeight}`
                        : '-'
                    }
                  />
                </Section>
              </div>
            </div>

            <div className="lg:col-span-8 xl:col-span-9">
              <div className="space-y-6">
                <div className="app-frame rounded-lg p-6">
                  <Subheading className="mb-4 flex items-center gap-2">
                    <FileTextIcon className="h-5 w-5 text-[var(--accent-9)]" />
                    Description
                  </Subheading>
                  <div className="prose prose-sm max-w-none text-[var(--gray-11)] whitespace-pre-wrap">
                    {ticket.description}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EditTicketDialog
        ticket={ticket}
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={async (updates) => {
          try {
            const updatedTicket = await updateTicket(ticket.id, updates)
            setTicket(updatedTicket)
            setIsEditDialogOpen(false)
            toast.success('Ticket updated successfully')
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update ticket')
          }
        }}
      />

      <DeleteTicketDialog
        ticket={ticket}
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={async () => {
          try {
            await deleteTicket(ticket.id)
            toast.success('Ticket deleted successfully')
            navigate(`/project/${project}/tickets`)
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete ticket')
          }
        }}
      />
    </>
  )
}
