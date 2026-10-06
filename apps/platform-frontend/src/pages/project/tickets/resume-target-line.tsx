import { getResumeTarget, type ResumeTarget } from '@/service/api/discussion-api'
import type { TaskTurnAction } from '@viberglass/types'
import { useEffect, useState } from 'react'

const STEP: Record<TaskTurnAction, string> = {
  plan: 'asks it to write the plan again',
  code: 'asks it to build again',
  reply: 'asks it to reply',
  summarise: 'asks it to summarise again',
}

/**
 * Says which agent carrying on resumes, and with what, before anyone does:
 * only the work the task was on last. Older paused sessions are released without a run.
 */
export function ResumeTargetLine({ taskId, refreshKey, agentName }: { taskId: string; refreshKey: string; agentName: (id: string) => string | null }) {
  const [target, setTarget] = useState<ResumeTarget | null>(null)
  useEffect(() => {
    let current = true
    getResumeTarget(taskId)
      .then((loaded) => current && setTarget(loaded))
      .catch(() => current && setTarget(null))
    return () => {
      current = false
    }
  }, [taskId, refreshKey])
  if (!target) return null
  const name = agentName(target.clankerId) ?? 'The agent'
  return (
    <p className="mt-1 text-[var(--gray-10)]">
      Carrying on resumes {name} only, and {target.action ? STEP[target.action] : 'it reads what was written meanwhile'}. Other agents
      paused on this task stay quiet until someone asks them.
    </p>
  )
}
