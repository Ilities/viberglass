import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { RunTicketModal } from '@/components/run-ticket-modal'
import { formatAutoFixStatus, formatSeverity, formatTimestamp } from '@/data'
import { ChevronDownIcon, PlayIcon } from '@radix-ui/react-icons'
import type { Clanker, Ticket, TicketLifecycleStatus, TicketWorkflowPhase } from '@viberglass/types'
import { useMemo, useState } from 'react'
import {
  formatTicketStatus,
  formatTicketWorkflowPhase,
  ticketStatusOrder,
  ticketWorkflowPhaseOrder,
} from './ticket-display'

interface TicketsBoardProps {
  tickets: Ticket[]
  clankers: Clanker[]
  project: string
  selectedTicketIds: Set<string>
  showArchived: boolean
  isArchiveMutationPending: boolean
  visiblePhases: TicketWorkflowPhase[]
  visibleStatuses: TicketLifecycleStatus[]
  onToggleTicketSelection: (ticketId: string) => void
  onArchiveTicket: (ticketId: string) => void
  onUnarchiveTicket: (ticketId: string) => void
}

const boardColumnStyles: Record<TicketWorkflowPhase, string> = {
  research: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20',
  planning: 'border-violet-200 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-950/20',
  execution: 'border-cyan-200 bg-cyan-50/70 dark:border-cyan-900/60 dark:bg-cyan-950/20',
}

export function TicketsBoard({
  tickets,
  clankers,
  project,
  selectedTicketIds,
  showArchived,
  isArchiveMutationPending,
  visiblePhases,
  visibleStatuses,
  onToggleTicketSelection,
  onArchiveTicket,
  onUnarchiveTicket,
}: TicketsBoardProps) {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const activeClankers = clankers.filter((clanker) => clanker.status === 'active' && clanker.deploymentStrategyId)
  const canRun = activeClankers.length > 0

  const phaseGroups = useMemo(() => {
    const groups: Record<TicketWorkflowPhase, Record<TicketLifecycleStatus, Ticket[]>> = {
      research: { open: [], in_progress: [], resolved: [] },
      planning: { open: [], in_progress: [], resolved: [] },
      execution: { open: [], in_progress: [], resolved: [] },
    }

    for (const ticket of tickets) {
      groups[ticket.workflowPhase][ticket.status].push(ticket)
    }

    return groups
  }, [tickets])

  const orderedPhases = ticketWorkflowPhaseOrder.filter((phase) => visiblePhases.includes(phase))
  const orderedStatuses = ticketStatusOrder.filter((status) => visibleStatuses.includes(status))

  function handleRunClick(ticket: Ticket, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedTicket(ticket)
  }

  function handleArchive(ticketId: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    onArchiveTicket(ticketId)
  }

  function handleUnarchive(ticketId: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    onUnarchiveTicket(ticketId)
  }

  function handleToggleSelection(ticketId: string, event: React.ChangeEvent<HTMLInputElement>) {
    event.stopPropagation()
    onToggleTicketSelection(ticketId)
  }

  function toggleSection(sectionKey: string) {
    setCollapsedSections((previous) => ({
      ...previous,
      [sectionKey]: !previous[sectionKey],
    }))
  }

  return (
    <>
      <div className={`mt-8 grid gap-4 ${orderedPhases.length === 1 ? 'grid-cols-1' : orderedPhases.length === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-3'}`}>
        {orderedPhases.map((phaseKey) => {
          const phaseInfo = formatTicketWorkflowPhase(phaseKey)
          const phaseTickets = orderedStatuses.flatMap((statusKey) => phaseGroups[phaseKey][statusKey])

          return (
            <section key={phaseKey} className={`rounded-2xl border p-4 ${boardColumnStyles[phaseKey]}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-[0.01em] text-zinc-900 dark:text-zinc-100">
                    {phaseInfo.label}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {phaseTickets.length} ticket{phaseTickets.length === 1 ? '' : 's'}
                  </p>
                </div>
                <Badge className={phaseInfo.className}>{phaseTickets.length}</Badge>
              </div>

              <div className="mt-4 space-y-4">
                {orderedStatuses.map((statusKey) => {
                  const statusInfo = formatTicketStatus(statusKey)
                  const statusTickets = phaseGroups[phaseKey][statusKey]
                  const sectionKey = `${phaseKey}:${statusKey}`
                  const isCollapsed = collapsedSections[sectionKey] ?? statusTickets.length === 0

                  return (
                    <div key={statusKey} className="space-y-3">
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-zinc-300/80 bg-white/50 px-3 py-2 text-left transition hover:border-zinc-400 hover:bg-white/70 dark:border-zinc-700 dark:bg-zinc-950/30 dark:hover:border-zinc-600 dark:hover:bg-zinc-950/50"
                        aria-expanded={!isCollapsed}
                      >
                        <span className="flex items-center gap-2">
                          <ChevronDownIcon
                            className={`h-4 w-4 text-zinc-500 transition-transform dark:text-zinc-400 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                          />
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{statusInfo.label}</span>
                        </span>
                        <Badge className={statusInfo.className}>{statusTickets.length}</Badge>
                      </button>

                      {!isCollapsed ? (
                        statusTickets.length > 0 ? (
                          <div className="space-y-2">
                            {statusTickets.map((ticket) => {
                              const severityInfo = formatSeverity(ticket.severity)
                              const autoFixInfo = ticket.autoFixStatus ? formatAutoFixStatus(ticket.autoFixStatus) : null
                              const isSelected = selectedTicketIds.has(ticket.id)

                              return (
                                <article
                                  key={ticket.id}
                                  className="rounded-lg border border-white/70 bg-white/95 p-3 shadow-sm ring-1 ring-black/3 backdrop-blur dark:border-white/8 dark:bg-zinc-950/80"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <label className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                      <input
                                        aria-label={`Select ticket ${ticket.title}`}
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(event) => handleToggleSelection(ticket.id, event)}
                                      />
                                      <span className="sr-only">Select</span>
                                    </label>
                                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                      {formatTimestamp(ticket.timestamp)}
                                    </span>
                                  </div>

                                  <div className="mt-1.5">
                                    <Link
                                      href={`/project/${project}/tickets/${ticket.id}`}
                                      className="text-[13px] font-semibold leading-5 text-zinc-900 hover:text-amber-700 dark:text-zinc-100 dark:hover:text-amber-300"
                                    >
                                      {ticket.title}
                                    </Link>
                                    <p className="mt-0.5 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                                      {ticket.category}
                                    </p>
                                  </div>

                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <Badge color={severityInfo.badgeColor} className="text-[10px]">
                                      {severityInfo.label}
                                    </Badge>
                                    <Badge className={`${statusInfo.className} text-[10px]`}>{statusInfo.label}</Badge>
                                    {autoFixInfo ? (
                                      <Badge className={`${autoFixInfo.color} text-[10px]`}>{autoFixInfo.label}</Badge>
                                    ) : null}
                                  </div>

                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    {showArchived ? (
                                      <Button
                                        plain
                                        className="px-0 text-[11px]"
                                        disabled={isArchiveMutationPending}
                                        onClick={(event) => handleUnarchive(ticket.id, event)}
                                      >
                                        Unarchive
                                      </Button>
                                    ) : (
                                      <Button
                                        plain
                                        className="px-0 text-[11px]"
                                        disabled={isArchiveMutationPending}
                                        onClick={(event) => handleArchive(ticket.id, event)}
                                      >
                                        Archive
                                      </Button>
                                    )}

                                    <Button
                                      plain
                                      className="px-1"
                                      onClick={(event) => handleRunClick(ticket, event)}
                                      title={canRun ? 'Run with clanker' : 'No active clankers available'}
                                    >
                                      <PlayIcon className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-zinc-300 bg-white/60 px-3 py-4 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-400">
                            No tickets in this section.
                          </div>
                        )
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <RunTicketModal
        ticket={selectedTicket}
        clankers={clankers}
        project={project}
        open={selectedTicket !== null}
        onClose={() => setSelectedTicket(null)}
      />
    </>
  )
}
