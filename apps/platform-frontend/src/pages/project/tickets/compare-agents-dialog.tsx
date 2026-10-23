import { Button } from '@/components/button'
import { Checkbox, CheckboxField, CheckboxGroup } from '@/components/checkbox'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, Label } from '@/components/fieldset'
import { SegmentedControl } from '@/components/segmented-control'
import { Textarea } from '@/components/textarea'
import { startTaskComparison } from '@/service/api/comparison-api'
import { TASK_COMPARISON_ARMS, type TaskComparisonsView, type TaskTurnAction } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/** Where the forks start: the task as it is now, or as it was when one of the agent's turns finished. */
export interface ForkPoint {
  turnId: string
  /** How the dialog names the turn, e.g. "Claude Code's turn at 14:02". */
  label: string
}

const ASKS: Array<{ value: Extract<TaskTurnAction, 'reply' | 'plan' | 'code'>; label: string; placeholder: string }> = [
  { value: 'plan', label: 'Plan', placeholder: 'Write the plan' },
  { value: 'code', label: 'Build', placeholder: 'Build it' },
  { value: 'reply', label: 'Reply', placeholder: 'What should each agent do?' },
]

interface CompareAgentsDialogProps {
  taskId: string
  agents: Array<{ id: string; name: string }>
  open: boolean
  from: ForkPoint | null
  onClose: () => void
  onStarted: (view: TaskComparisonsView) => void
}

/**
 * Starts a comparison: the task is forked once per agent, each fork gets the
 * same ask, and each works on its own branch and pull request.
 */
export function CompareAgentsDialog({ taskId, agents, open, from, onClose, onStarted }: CompareAgentsDialogProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [action, setAction] = useState<(typeof ASKS)[number]['value']>('code')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected([])
    setMessage('')
  }, [open])

  const ask = ASKS.find((entry) => entry.value === action) ?? ASKS[0]
  const tooMany = selected.length >= TASK_COMPARISON_ARMS.max
  const canStart =
    selected.length >= TASK_COMPARISON_ARMS.min && (action !== 'reply' || message.trim().length > 0) && !busy

  async function start() {
    setBusy(true)
    try {
      const view = await startTaskComparison(taskId, {
        agentIds: selected,
        message: message.trim(),
        action,
        ...(from ? { fromTurnId: from.turnId } : {}),
      })
      onStarted(view)
      onClose()
      toast.success(`Comparing ${selected.length} agents`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the comparison")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Compare agents</DialogTitle>
      <DialogDescription>
        {from ? `Forks this task as it was after ${from.label}` : 'Forks this task as it is now'}, once per agent. Each fork
        gets the thread, plan and code of that moment, and its own branch and pull request. This task stays as it is.
      </DialogDescription>
      <DialogBody className="space-y-6">
        <Field>
          <Label>Agents</Label>
          <Description>
            Pick {TASK_COMPARISON_ARMS.min} to {TASK_COMPARISON_ARMS.max}. Each starts fresh from the same record.
          </Description>
          {agents.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--gray-10)]">No agent is ready to run.</p>
          ) : (
            <CheckboxGroup className="mt-3">
              {agents.map((agent) => {
                const checked = selected.includes(agent.id)
                return (
                  <CheckboxField key={agent.id} disabled={!checked && tooMany}>
                    <Checkbox
                      checked={checked}
                      onChange={(on) => setSelected(on ? [...selected, agent.id] : selected.filter((id) => id !== agent.id))}
                    />
                    <Label>{agent.name}</Label>
                  </CheckboxField>
                )
              })}
            </CheckboxGroup>
          )}
        </Field>
        <Field>
          <Label>Ask each to</Label>
          <div className="mt-3">
            <SegmentedControl options={ASKS} value={action} onChange={(value) => setAction(ASKS.find((entry) => entry.value === value)?.value ?? 'code')} />
          </div>
        </Field>
        <Field>
          <Label>Message</Label>
          <Textarea rows={3} value={message} placeholder={ask.placeholder} onChange={(event) => setMessage(event.target.value)} />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button color="brand" onClick={() => void start()} disabled={!canStart}>
          {busy ? 'Starting…' : selected.length >= TASK_COMPARISON_ARMS.min ? `Compare ${selected.length} agents` : 'Compare'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
