import { askAgent } from '@/service/api/discussion-api'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

interface RunNextStepActionsInput {
  project: string
  ticketId: string | null
  /** The agent this run used; follow-up runs ask it too, else the agent on the task. */
  clankerId: string | null
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** The moves a run's "your move" card can make, with one busy flag between them. */
export function useRunNextStepActions({ project, ticketId, clankerId }: RunNextStepActionsInput) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'retry' | null>(null)

  const openRun = (jobId: string) =>
    navigate(ticketId ? `/spaces/${project}/tasks/${ticketId}?run=${jobId}` : `/spaces/${project}/runs/${jobId}`)

  /** Asks the agent for the plan in the task's thread, as a message from the person pressing the button. */
  async function askForPlan(): Promise<string> {
    if (!ticketId) throw new Error('This run has no task to continue')
    const turn = await askAgent(ticketId, { action: 'plan', body: 'Write the plan', agentId: clankerId ?? undefined })
    if (!turn.jobId) throw new Error('The agent is busy; it reads your message when it finishes')
    return turn.jobId
  }

  async function runAgain() {
    setBusy('retry')
    try {
      openRun(await askForPlan())
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to ask for the plan'))
    } finally {
      setBusy(null)
    }
  }

  return { busy, runAgain }
}
