import { getClankersList, getTicketDetails } from '@/data'
import { getTaskPlanParts } from '@/service/api/build-api'
import { getJobs, type JobListItem } from '@/service/api/job-api'
import { listSessionsForTicket, type AgentSession } from '@/service/api/session-api'
import {
  getPlanComments,
  getPlan,
  getTaskByKey,
  type PhaseDocumentResponse,
} from '@/service/api/ticket-api'
import { isTaskKey, type Clanker, type TaskCapabilities, type TaskPlanParts, type Ticket } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { countNewComments } from './task-suggestions'

export interface TaskPageData {
  ticket: Ticket
  clankers: Clanker[]
  /** Newest first. */
  runs: JobListItem[]
  plan: PhaseDocumentResponse
  /** Open comments on the plan made since its latest version. */
  newComments: number
  sessions: AgentSession[]
  /** What the person may ask the agent for; null if it couldn't be loaded, so nothing is offered. */
  capabilities: TaskCapabilities | null
  /** The plan part by part, from the task's pull requests; null if it couldn't be loaded. */
  planParts: TaskPlanParts | null
}

const POLL_MS = 5000
// A session stays open between turns; only an active one has the agent working.
const WORKING_SESSION = ['active']

async function loadTask(id: string): Promise<Omit<TaskPageData, 'clankers'> | null> {
  const [ticket, runs, plan, planComments, sessions, planParts] = await Promise.all([
    getTicketDetails(id),
    getJobs({ ticketId: id, limit: 50 }),
    getPlan(id),
    getPlanComments(id).catch(() => []),
    listSessionsForTicket(id),
    getTaskPlanParts(id).catch(() => null),
  ])
  if (!ticket) return null
  return {
    ticket,
    runs: runs.jobs,
    plan: plan.document,
    newComments: countNewComments(planComments, plan.document.updatedAt),
    sessions,
    capabilities: ticket.capabilities ?? null,
    planParts,
  }
}

/** The task's id for a route that shows either its key (WEB-42) or its id. Null when the key matches no task. */
function useTaskId(routeId: string | undefined): string | undefined | null {
  const [resolved, setResolved] = useState<{ routeId: string; id: string | null } | null>(null)
  useEffect(() => {
    if (!routeId || !isTaskKey(routeId)) return
    let cancelled = false
    getTaskByKey(routeId)
      .then((ticket) => !cancelled && setResolved({ routeId, id: ticket.id }))
      .catch(() => !cancelled && setResolved({ routeId, id: null }))
    return () => {
      cancelled = true
    }
  }, [routeId])
  if (!routeId || !isTaskKey(routeId)) return routeId
  return resolved?.routeId === routeId ? resolved.id : undefined
}

/** Everything the task page shows, kept current while an agent works on it. */
export function useTaskPage(routeId: string | undefined) {
  const taskId = useTaskId(routeId)
  const id = taskId ?? undefined
  const [data, setData] = useState<TaskPageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!id) return
    const task = await loadTask(id)
    if (task) setData((previous) => (previous ? { ...previous, ...task } : null))
  }, [id])

  useEffect(() => {
    // A key still being looked up: keep showing the page as loading.
    if (routeId && taskId === undefined) return
    let cancelled = false
    setIsLoading(true)
    async function load() {
      if (!id) return
      const [task, clankers] = await Promise.all([loadTask(id), getClankersList()])
      if (!cancelled) setData(task ? { ...task, clankers } : null)
    }
    void load().finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, routeId, taskId])

  // While an agent works (a run or a live session), keep the page current without a reload.
  const isBusy =
    data?.runs.some((run) => run.status === 'queued' || run.status === 'active') ||
    data?.sessions.some((session) => WORKING_SESSION.includes(session.status)) ||
    false
  useEffect(() => {
    if (!isBusy) return
    const timer = setInterval(() => void reload().catch(() => undefined), POLL_MS)
    return () => clearInterval(timer)
  }, [isBusy, reload])

  // Edits answer with the task alone; its situation and capabilities stay until the next load.
  const setTicket = useCallback(
    (ticket: Ticket) => setData((previous) => (previous ? { ...previous, ticket: { ...previous.ticket, ...ticket } } : null)),
    []
  )
  const setDocument = useCallback(
    (document: PhaseDocumentResponse) => setData((previous) => (previous ? { ...previous, plan: document } : null)),
    []
  )

  return { data, isLoading, reload, setTicket, setDocument }
}

/** The agent's session that has a turn running, if any. */
export function workingSession(sessions: AgentSession[]): AgentSession | undefined {
  return sessions.find((session) => WORKING_SESSION.includes(session.status))
}
