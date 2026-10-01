import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/listbox'
import { RunTargetSummary } from '@/components/run-target-summary'
import { askAgent } from '@/service/api/discussion-api'
import type { Clanker, TaskTurnAction, Ticket } from '@viberglass/types'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { taskPath } from '@/lib/taskPath'

type RunMode = 'execution' | 'research' | 'planning'

const ACTION: Record<RunMode, TaskTurnAction> = { research: 'research', planning: 'plan', execution: 'code' }
const ASK: Record<RunMode, { title: string; message: string; started: string }> = {
  research: { title: 'Ask for the research', message: 'Write the research', started: 'Asked the agent for the research' },
  planning: { title: 'Ask for the plan', message: 'Write the plan', started: 'Asked the agent for the plan' },
  execution: { title: 'Ask the agent to build it', message: 'Build it', started: 'Asked the agent to build it' },
}

interface RunTicketModalProps {
  ticket: Ticket | null
  clankers: Clanker[]
  project: string
  open: boolean
  onClose: () => void
  mode?: RunMode
}

export function RunTicketModal({
  ticket,
  clankers,
  project,
  open,
  onClose,
  mode = 'execution',
}: RunTicketModalProps) {
  const navigate = useNavigate()
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const configuredClankers = clankers.filter((c) => c.deploymentStrategyId)
  const firstConfiguredClanker = configuredClankers[0]
  const [selectedClankerId, setSelectedClankerId] = useState<string>(activeClankers[0]?.id ?? '')
  const [isRunning, setIsRunning] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (activeClankers.length === 0) {
      if (selectedClankerId) setSelectedClankerId('')
      return
    }

    if (!activeClankers.some((clanker) => clanker.id === selectedClankerId)) {
      setSelectedClankerId(activeClankers[0].id)
    }
  }, [activeClankers, selectedClankerId])

  const selectedClanker = activeClankers.find((clanker) => clanker.id === selectedClankerId) ?? null
  const noClankersMessage = configuredClankers.length > 0
    ? `You have ${configuredClankers.length} configured agent${configuredClankers.length === 1 ? '' : 's'}, but none are "started". The ECS task definition, container, or Lambda isn't deployed depending on the type.`
    : 'No agents are configured yet. Configure and start one before running this task.'

  // Reset selection when modal opens with new ticket
  // (handled by parent re-mounting or passing key)

  async function handleRun() {
    if (!ticket || !selectedClanker) return

    setIsRunning(true)
    try {
      await askAgent(ticket.id, {
        action: ACTION[mode],
        body: message.trim() || ASK[mode].message,
        agentId: selectedClanker.id,
      })
      toast.success(ASK[mode].started, { description: `${selectedClanker.name} is on "${ticket.title}"` })
      navigate(taskPath(project, ticket))
      onClose()
    } catch (error) {
      toast.error("Couldn't ask the agent", {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setIsRunning(false)
    }
  }

  if (!ticket) return null

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{ASK[mode].title}</DialogTitle>
      <DialogDescription>Your message goes in the task&apos;s thread, where the agent answers.</DialogDescription>
      <DialogBody>
        <div className="space-y-6">
          {/* Ticket Info (read-only display) */}
          <div>
            <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Task</h4>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{ticket.title}</p>
            {ticket.description && (
              <p className="mt-2 line-clamp-3 text-sm text-zinc-500 dark:text-zinc-500">{ticket.description}</p>
            )}
          </div>

          {/* Clanker Selection */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Agent</h4>
            {activeClankers.length > 0 ? (
              <Listbox
                value={selectedClankerId}
                onChange={setSelectedClankerId}
                placeholder="Select an agent runner..."
              >
                {activeClankers.map((clanker) => (
                  <ListboxOption key={clanker.id} value={clanker.id}>
                    <ListboxLabel>{clanker.name}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{noClankersMessage}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button href="/settings/agents" color="brand">
                    Configure Agents
                  </Button>
                  {firstConfiguredClanker && (
                    <Button href={`/settings/agents/${firstConfiguredClanker.slug}/edit`} outline>
                      Open Agent Configuration
                    </Button>
                  )}
                  {firstConfiguredClanker && (
                    <Button href={`/settings/agents/${firstConfiguredClanker.slug}`} outline>
                      View Agent Status
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {mode === 'execution' && <RunTargetSummary ticket={ticket} clankerId={selectedClanker?.id} />}

          <div>
            <h4 className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Message (optional)</h4>
            <textarea
              aria-label="Message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder={`${ASK[mode].message}, and anything the agent should know`}
            />
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={isRunning}>
          Cancel
        </Button>
        <Button color="brand" disabled={isRunning || !selectedClanker} onClick={() => void handleRun()}>
          {isRunning ? 'Asking…' : 'Ask the agent'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
