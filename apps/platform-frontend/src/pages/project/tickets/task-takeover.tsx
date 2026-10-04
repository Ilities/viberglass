import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'
import { handBackTask } from '@/service/api/discussion-api'
import type { TaskCodeBranch } from '@viberglass/types'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { HandoffCard } from '../jobs/handoff-card'

/** How to get the task's branch onto your machine: the CLI, or git itself. */
export function checkoutCommands(branch: TaskCodeBranch, taskKey: string): string {
  const git = branch.pushed
    ? `git fetch origin ${branch.branch}\ngit switch ${branch.branch}`
    : `git fetch origin ${branch.baseBranch}\ngit switch -c ${branch.branch} origin/${branch.baseBranch}`
  return `viberglass checkout ${taskKey}\n\n# or with git, in a clone of ${branch.repositoryUrl}:\n${git}`
}

interface TaskTakeoverCardProps {
  taskId: string
  taskKey: string
  branch: TaskCodeBranch
  canSteer: boolean
  onHandedBack: () => void
  /** Which agent handing back resumes, and with what. */
  resumes?: ReactNode
}

/** The task while someone works on it themselves: where the work is, and handing it back to the agent. */
export function TaskTakeoverCard({ taskId, taskKey, branch, canSteer, onHandedBack, resumes }: TaskTakeoverCardProps) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!branch.takenOver) return null

  const handBack = async () => {
    setBusy(true)
    try {
      await handBackTask(taskId, note)
      setNote('')
      toast.success('Handed back: the agent carries on from your changes')
      onHandedBack()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to hand the work back')
    } finally {
      setBusy(false)
    }
  }

  return (
    <HandoffCard
      owner={canSteer ? 'you' : 'settled'}
      eyebrow="Taken over"
      title={`${branch.takenOver.by.name} is working on it locally`}
      actions={
        canSteer && (
          <Button color="brand" disabled={busy} onClick={() => void handBack()}>
            Hand back
          </Button>
        )
      }
    >
      <p>The agent is paused. Push your commits to the task&apos;s branch, then hand it back: the agent reads what you pushed first.</p>
      {resumes}
      <pre aria-label="Checkout commands" className="mt-3 overflow-x-auto rounded-md bg-[var(--gray-3)] p-3 font-mono text-xs text-[var(--gray-12)]">
        {checkoutCommands(branch, taskKey)}
      </pre>
      {canSteer && (
        <Textarea
          aria-label="Note for the agent"
          className="mt-3"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What you changed, and what the agent should do next (optional)"
          rows={2}
          disabled={busy}
        />
      )}
    </HandoffCard>
  )
}
