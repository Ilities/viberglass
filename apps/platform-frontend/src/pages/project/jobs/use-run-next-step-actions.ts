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
  const [busy, setBusy] = useState<'plan' | 'retry' | null>(null)

  const openRun = (jobId: string) =>
    navigate(ticketId ? `/spaces/${project}/tasks/${ticketId}?run=${jobId}` : `/spaces/${project}/runs/${jobId}`)

  /** Asks the agent in the task's thread, as a message from the person pressing the button. */
  async function startPhase(phase: 'research' | 'planning'): Promise<string> {
    if (!ticketId) throw new Error('This run has no task to continue')
    const turn = await askAgent(ticketId, {
      action: phase === 'research' ? 'research' : 'plan',
      body: phase === 'research' ? 'Try the research again' : 'Write the plan',
      agentId: clankerId ?? undefined,
    })
    if (!turn.jobId) throw new Error('The agent is busy; it reads your message when it finishes')
    return turn.jobId
  }

  /** Asks the agent for the plan, from research someone has read. */
  async function writePlan() {
    setBusy('plan')
    try {
      openRun(await startPhase('planning'))
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to ask for the plan'))
    } finally {
      setBusy(null)
    }
  }

  async function runAgain(phase: 'research' | 'planning') {
    setBusy('retry')
    try {
      openRun(await startPhase(phase))
    } catch (error) {
      toast.error(errorMessage(error, `Failed to start ${phase}`))
    } finally {
      setBusy(null)
    }
  }

  return { busy, writePlan, runAgain }
}
