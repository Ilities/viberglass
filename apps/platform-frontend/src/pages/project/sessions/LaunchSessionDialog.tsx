import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { launchSession, type AgentSessionMode } from '@/service/api/session-api'
import type { Clanker } from '@viberglass/types'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

interface LaunchSessionDialogProps {
  open: boolean
  onClose: () => void
  ticketId: string
  project: string
  clankers: Clanker[]
}

export function LaunchSessionDialog({ open, onClose, ticketId, project, clankers }: LaunchSessionDialogProps) {
  const navigate = useNavigate()
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)

  const [clankerId, setClankerId] = useState(activeClankers[0]?.id ?? '')
  const [mode, setMode] = useState<AgentSessionMode>('research')
  const [initialMessage, setInitialMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleLaunch() {
    if (!clankerId || !initialMessage.trim()) return
    setSubmitting(true)
    try {
      const result = await launchSession(ticketId, {
        clankerId,
        mode,
        initialMessage: initialMessage.trim(),
      })
      toast.success('Session launched')
      onClose()
      navigate(`/project/${project}/sessions/${result.session.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to launch session')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => onClose()} size="lg">
      <DialogTitle>Start interactive session</DialogTitle>
      <DialogDescription>
        Launch an interactive ACP session for this ticket. You can chat, approve actions, and guide the agent in real time.
      </DialogDescription>
      <DialogBody>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--gray-11)]">Clanker</label>
            <Select value={clankerId} onChange={setClankerId} placeholder="Select a clanker">
              {activeClankers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {activeClankers.length === 0 && (
              <p className="mt-1 text-xs text-[var(--gray-8)]">No active clankers with deployment strategies available.</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--gray-11)]">Mode</label>
            <Select value={mode} onChange={(v) => setMode(v as AgentSessionMode)}>
              <option value="research">Research</option>
              <option value="planning">Planning</option>
              <option value="execution">Execution</option>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--gray-11)]">Initial message</label>
            <Textarea
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="Describe what you want the agent to do..."
              rows={4}
              disabled={submitting}
            />
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={() => onClose()} disabled={submitting}>
          Cancel
        </Button>
        <Button
          color="brand"
          onClick={() => void handleLaunch()}
          disabled={submitting || !clankerId || !initialMessage.trim()}
        >
          {submitting ? 'Launching...' : 'Launch session'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
