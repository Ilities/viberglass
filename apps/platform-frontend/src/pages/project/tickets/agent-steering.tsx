import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { getTaskBranch, pauseAgent, resumeAgent, retryPausedRuns, takeOverTask } from '@/service/api/discussion-api'
import type { TaskCodeBranch } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { HandoffCard } from '../jobs/handoff-card'
import { ResumeTargetLine } from './resume-target-line'
import { TaskTakeoverCard } from './task-takeover'

interface AgentSteeringProps {
  taskId: string
  taskKey: string
  /** Changes whenever the task's runs or sessions do, so who has the work stays current. */
  refreshKey: string
  agentWorking: boolean
  paused: boolean
  /** An agent's name by id, to say which one carrying on resumes. */
  agentName?: (id: string) => string | null
  /** Whether a setup failure paused it, until someone fixes the setup and tries again. */
  pausedForSetup?: boolean
  /** Whether the person may pause, resume and take over the agent, from the task's capabilities. */
  canSteer: boolean
  onChanged: () => void
}

/**
 * Pausing the agent while it works, letting it carry on, and taking its work
 * over. While it's paused, or someone has the work, everyone sees so, since
 * what they ask waits.
 */
export function AgentSteering({
  taskId,
  taskKey,
  refreshKey,
  agentWorking,
  paused,
  agentName = () => null,
  pausedForSetup = false,
  canSteer,
  onChanged,
}: AgentSteeringProps) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [branch, setBranch] = useState<TaskCodeBranch | null>(null)

  useEffect(() => {
    let current = true
    getTaskBranch(taskId)
      .then((loaded) => current && setBranch(loaded))
      .catch(() => current && setBranch(null))
    return () => {
      current = false
    }
  }, [taskId, refreshKey])

  const act = async (action: () => Promise<void>, done: string) => {
    setBusy(true)
    try {
      await action()
      toast.success(done)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  const takeOver = () =>
    act(async () => {
      setBranch(await takeOverTask(taskId))
    }, 'The work is yours: the agent is paused')

  if (branch?.takenOver) {
    return (
      <TaskTakeoverCard
        taskId={taskId}
        taskKey={taskKey}
        branch={branch}
        canSteer={canSteer}
        onHandedBack={onChanged}
        resumes={<ResumeTargetLine taskId={taskId} refreshKey={refreshKey} agentName={agentName} />}
      />
    )
  }
  if (paused && pausedForSetup) {
    const admin = user?.role === 'admin'
    return (
      <HandoffCard
        owner={canSteer ? 'you' : 'settled'}
        eyebrow="Paused until the setup is fixed"
        title="It tries again when someone asks it to"
        actions={
          <>
            {canSteer && (
              <Button color="brand" disabled={busy} onClick={() => void act(() => resumeAgent(taskId), 'Trying again')}>
                Try again
              </Button>
            )}
            {admin && (
              <Button outline disabled={busy} onClick={() => void act(async () => void (await retryPausedRuns()), 'Trying every paused run again')}>
                Retry all paused runs
              </Button>
            )}
          </>
        }
      >
        <p>What people ask waits. After the fix, try this task again, or every task the same problem paused.</p>
        <ResumeTargetLine taskId={taskId} refreshKey={refreshKey} agentName={agentName} />
      </HandoffCard>
    )
  }
  if (paused) {
    return (
      <HandoffCard
        owner={canSteer ? 'you' : 'settled'}
        eyebrow="The agent is paused"
        title="What people ask waits until it carries on"
        actions={
          canSteer && (
            <Button color="brand" disabled={busy} onClick={() => void act(() => resumeAgent(taskId), 'The agent carries on')}>
              Let it carry on
            </Button>
          )
        }
      >
        <ResumeTargetLine taskId={taskId} refreshKey={refreshKey} agentName={agentName} />
      </HandoffCard>
    )
  }
  if (!canSteer || (!agentWorking && !branch)) return null
  return (
    <div className="flex justify-end gap-2">
      {agentWorking && (
        <Button plain disabled={busy} onClick={() => void act(() => pauseAgent(taskId), 'Paused the agent')}>
          Pause the agent
        </Button>
      )}
      {branch && (
        <Button plain disabled={busy} onClick={() => void takeOver()}>
          Take over
        </Button>
      )}
    </div>
  )
}
