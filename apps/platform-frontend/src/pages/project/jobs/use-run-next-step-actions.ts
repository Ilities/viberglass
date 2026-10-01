import { askAgent } from '@/service/api/discussion-api'
import { approvePlanning, approveResearch } from '@/service/api/ticket-api'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

interface RunNextStepActionsInput {
  project: string
  ticketId: string | null
  /** The agent this run used; follow-up runs ask it too, else the agent on the task. */
  clankerId: string | null
  onChanged: () => void
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** The moves a run's "your move" card can make, with one busy flag between them. */
export function useRunNextStepActions({ project, ticketId, clankerId, onChanged }: RunNextStepActionsInput) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'approve' | 'retry' | null>(null)

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

  /** A task reopened at research keeps its plan; approving puts that plan up for review instead of writing a new one. */
  async function approveResearchAndPlan({ planExists = false }: { planExists?: boolean } = {}) {
    if (!ticketId) return
    setBusy('approve')
    try {
      await approveResearch(ticketId)
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to approve research'))
      setBusy(null)
      return
    }
    if (planExists) {
      toast.success('Research approved. The plan is up for review again.')
      setBusy(null)
      onChanged()
      return
    }
    try {
      const jobId = await startPhase('planning')
      toast.success('Research approved. Planning started.')
      openRun(jobId)
    } catch (error) {
      toast.error('Research approved, but planning did not start', { description: errorMessage(error, 'Unknown error') })
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function approvePlan() {
    if (!ticketId) return
    setBusy('approve')
    try {
      await approvePlanning(ticketId)
      toast.success('Plan approved. The build is next.')
      onChanged()
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to approve the plan'))
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

  return { busy, approveResearchAndPlan, approvePlan, runAgain }
}
