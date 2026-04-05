import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/listbox'
import { runPlanningRevision, runResearchRevision } from '@/service/api/ticket-api'
import type { Clanker, Ticket } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

type RevisionMode = 'research' | 'planning'

interface RevisionModalProps {
  ticket: Ticket | null
  clankers: Clanker[]
  project: string
  open: boolean
  onClose: () => void
  mode: RevisionMode
}

export function RevisionModal({ ticket, clankers, project, open, onClose, mode }: RevisionModalProps) {
  const navigate = useNavigate()
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const configuredClankers = clankers.filter((c) => c.deploymentStrategyId)
  const firstConfiguredClanker = configuredClankers[0]
  const [selectedClankerId, setSelectedClankerId] = useState<string>(activeClankers[0]?.id ?? '')
  const [isRunning, setIsRunning] = useState(false)
  const [revisionMessage, setRevisionMessage] = useState('')

  useEffect(() => {
    if (activeClankers.length === 0) {
      if (selectedClankerId) setSelectedClankerId('')
      return
    }

    if (!activeClankers.some((clanker) => clanker.id === selectedClankerId)) {
      setSelectedClankerId(activeClankers[0].id)
    }
  }, [activeClankers, selectedClankerId])

  useEffect(() => {
    if (open) {
      setRevisionMessage('')
    }
  }, [open])

  const selectedClanker = activeClankers.find((clanker) => clanker.id === selectedClankerId) ?? null
  const noClankersMessage =
    configuredClankers.length > 0
      ? `You have ${configuredClankers.length} configured clanker${configuredClankers.length === 1 ? '' : 's'}, but none are "started".`
      : 'No clankers are configured yet. Configure and start one before running this ticket.'

  async function handleRun() {
    if (!ticket || !selectedClanker || !revisionMessage.trim()) return

    setIsRunning(true)
    try {
      const response =
        mode === 'research'
          ? await runResearchRevision(ticket.id, selectedClanker.id, revisionMessage.trim())
          : await runPlanningRevision(ticket.id, selectedClanker.id, revisionMessage.trim())
      const jobId = response.data.jobId

      toast.success(mode === 'research' ? 'Research revision started' : 'Planning revision started', {
        description: `Revising "${ticket.title}" with ${selectedClanker.name}`,
        action: {
          label: 'View Job',
          onClick: () => navigate(`/project/${project}/jobs/${jobId}`),
        },
      })

      navigate(`/project/${project}/jobs/${jobId}`)
      onClose()
    } catch (error) {
      console.error('Failed to run revision:', error)
      toast.error('Failed to start revision', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setIsRunning(false)
    }
  }

  if (!ticket) return null

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{mode === 'research' ? 'Revise Research with Clanker' : 'Revise Planning with Clanker'}</DialogTitle>
      <DialogDescription>
        {mode === 'research'
          ? 'Create a job to revise the research document for this ticket based on your feedback.'
          : 'Create a job to revise the planning document for this ticket based on your feedback.'}
      </DialogDescription>
      <DialogBody>
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Ticket</h4>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{ticket.title}</p>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Select Clanker</h4>
            {activeClankers.length > 0 ? (
              <Listbox value={selectedClankerId} onChange={setSelectedClankerId} placeholder="Select a clanker...">
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
                  <Button href="/clankers" color="brand">
                    Configure Clankers
                  </Button>
                  {firstConfiguredClanker && (
                    <Button href={`/clankers/${firstConfiguredClanker.slug}/edit`} outline>
                      Open Clanker Configuration
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">What should be revised?</h4>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              Describe the changes or feedback for the agent. Unresolved inline comments from the existing file are
              automatically added in.
            </p>
            <textarea
              value={revisionMessage}
              onChange={(event) => setRevisionMessage(event.target.value)}
              rows={4}
              className="focus:border-brand-500 focus:ring-brand-500/30 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="E.g., 'The research should focus more on security aspects and include recent CVEs for the dependencies mentioned.'"
            />
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={isRunning}>
          Cancel
        </Button>
        <Button color="brand" disabled={isRunning || !selectedClanker || !revisionMessage.trim()} onClick={handleRun}>
          {isRunning ? 'Starting...' : `Revise with ${selectedClanker?.name || 'Clanker'}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
