import { getTicketDetails } from '@/data'
import { getAgentDirectory } from '@/service/api/agent-directory-api'
import { getTaskPlanParts } from '@/service/api/build-api'
import { getJobs, type JobListItem } from '@/service/api/job-api'
import { listSessionsForTicket, type AgentSession } from '@/service/api/session-api'
import {
  getPlanComments,
  getPlan,
  getTaskByKey,
  TaskNotFoundError,
  type PhaseDocumentResponse,
} from '@/service/api/ticket-api'
import { isTaskKey, type AgentDirectoryEntry, type TaskCapabilities, type TaskPlanParts, type Ticket } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { countNewComments } from './task-suggestions'

export interface TaskPageData {
  ticket: Ticket
  clankers: AgentDirectoryEntry[]
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

/** Why the task page has nothing to show: the task isn't there, or loading it failed and can be tried again. */
export type TaskLoadFailure = 'not-found' | 'failed'

async function loadTask(id: string): Promise<Omit<TaskPageData, 'clankers'> | null> {
  const ticketRequest = getTicketDetails(id)
  const [ticket, runs, plan, planComments, sessions, planParts] = await Promise.all([
    ticketRequest,
    getJobs({ ticketId: id, limit: 50 }),
    getPlan(id),
    getPlanComments(id).catch(() => []),
    listSessionsForTicket(id),
    getTaskPlanParts(id).catch(() => null),
  ]).catch(async (error: unknown) => {
    // For a missing task every request fails, in any order; the task's own request says whether it's missing.
    const ticketError: unknown = await ticketRequest.then(() => null, (failure: unknown) => failure)
    throw ticketError instanceof TaskNotFoundError ? ticketError : error
  })
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

/** The task's id for a route that shows either its key (WEB-42) or its id, or why a key couldn't be looked up. */
function useTaskId(routeId: string | undefined, attempt: number): string | undefined | TaskLoadFailure {
  const [resolved, setResolved] = useState<{ routeId: string; attempt: number; id: string | TaskLoadFailure } | null>(null)
  useEffect(() => {
    if (!routeId || !isTaskKey(routeId)) return
    let cancelled = false
    getTaskByKey(routeId)
      .then((ticket) => !cancelled && setResolved({ routeId, attempt, id: ticket.id }))
      .catch(
        (error: unknown) =>
          !cancelled && setResolved({ routeId, attempt, id: error instanceof TaskNotFoundError ? 'not-found' : 'failed' })
      )
    return () => {
      cancelled = true
    }
  }, [routeId, attempt])
  if (!routeId || !isTaskKey(routeId)) return routeId
  return resolved?.routeId === routeId && resolved.attempt === attempt ? resolved.id : undefined
}

const isFailure = (value: string | undefined): value is TaskLoadFailure => value === 'not-found' || value === 'failed'

/** Everything the task page shows, kept current while an agent works on it. */
export function useTaskPage(routeId: string | undefined) {
  const [attempt, setAttempt] = useState(0)
  const taskId = useTaskId(routeId, attempt)
  const id = isFailure(taskId) ? undefined : taskId
  const [data, setData] = useState<TaskPageData | null>(null)
  const [loadFailure, setLoadFailure] = useState<TaskLoadFailure | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!id) return
    const task = await loadTask(id)
    if (task) setData((previous) => (previous ? { ...previous, ...task } : null))
  }, [id])

  useEffect(() => {
    setIsLoading(true)
    // A key still being looked up: keep showing the page as loading.
    if (routeId && taskId === undefined) return
    let cancelled = false
    setLoadFailure(isFailure(taskId) ? taskId : null)
    async function load() {
      if (!id) return
      const [task, clankers] = await Promise.all([loadTask(id), getAgentDirectory()])
      if (!cancelled) setData(task ? { ...task, clankers } : null)
    }
    void load()
      .catch((error: unknown) => {
        if (cancelled) return
        setData(null)
        setLoadFailure(error instanceof TaskNotFoundError ? 'not-found' : 'failed')
      })
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, routeId, taskId, attempt])

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

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  return { data, isLoading, loadFailure, retry, reload, setTicket, setDocument }
}

/** The agent's session that has a turn running, if any. */
export function workingSession(sessions: AgentSession[]): AgentSession | undefined {
  return sessions.find((session) => WORKING_SESSION.includes(session.status))
}
