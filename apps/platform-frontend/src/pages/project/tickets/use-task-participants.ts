import { getParticipants } from '@/service/api/participant-api'
import type { TaskParticipant } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

export interface TaskParticipants {
  participants: TaskParticipant[] | null
  /** Runs a change to the people and shows the list it returns. */
  change: (action: () => Promise<TaskParticipant[]>) => Promise<void>
}

/** The people on a task, loaded once for the header, the context line and the editor that share them. */
export function useTaskParticipants(taskId: string | undefined): TaskParticipants {
  const [participants, setParticipants] = useState<TaskParticipant[] | null>(null)

  useEffect(() => {
    if (!taskId) return
    getParticipants(taskId)
      .then(setParticipants)
      .catch(() => setParticipants([]))
  }, [taskId])

  const change = useCallback(async (action: () => Promise<TaskParticipant[]>) => {
    try {
      setParticipants(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change the people on this task')
    }
  }, [])

  return { participants, change }
}

export function withRole(participants: TaskParticipant[], role: TaskParticipant['role']): TaskParticipant[] {
  return participants.filter((participant) => participant.role === role)
}
