import { getClankersList, getTicketDetails } from '@/data'
import { getJobs, type JobListItem } from '@/service/api/job-api'
import { getTaskCapabilities } from '@/service/api/task-capabilities-api'
import { listSessionsForTicket, type AgentSession } from '@/service/api/session-api'
import {
  getPhaseDocumentComments,
  getPlanningPhase,
  getResearchDocument,
  getTaskByKey,
  type PhaseDocumentResponse,
} from '@/service/api/ticket-api'
import { isTaskKey, type Clanker, type TaskCapabilities, type Ticket } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { countNewComments } from './task-suggestions'

export interface TaskPageData {
  ticket: Ticket
  clankers: Clanker[]
  /** Newest first. */
  runs: JobListItem[]
  documents: { research: PhaseDocumentResponse; planning: PhaseDocumentResponse }
  /** Open comments on each document made since its latest version. */
  newComments: { research: number; planning: number }
  sessions: AgentSession[]
  /** What the person may ask the agent for; null if it couldn't be loaded, so nothing is offered. */
  capabilities: TaskCapabilities | null
}

const POLL_MS = 5000
// A session stays open between turns (ADR 0008); only an active one has the agent working.
const WORKING_SESSION = ['active']

async function loadTask(id: string): Promise<Omit<TaskPageData, 'clankers'> | null> {
  const [ticket, runs, research, planning, researchComments, planComments, sessions, capabilities] = await Promise.all([
    getTicketDetails(id),
    getJobs({ ticketId: id, limit: 50 }),
    getResearchDocument(id),
    getPlanningPhase(id),
    getPhaseDocumentComments(id, 'research').catch(() => []),
    getPhaseDocumentComments(id, 'planning').catch(() => []),
    listSessionsForTicket(id),
    getTaskCapabilities(id).catch(() => null),
  ])
  if (!ticket) return null
  return {
    ticket,
    runs: runs.jobs,
    documents: { research: research.document, planning: planning.document },
    newComments: {
      research: countNewComments(researchComments, research.document.updatedAt),
      planning: countNewComments(planComments, planning.document.updatedAt),
    },
    sessions,
    capabilities,
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

  const setTicket = useCallback((ticket: Ticket) => setData((previous) => (previous ? { ...previous, ticket } : null)), [])
  const setDocument = useCallback(
    (step: 'research' | 'planning', document: PhaseDocumentResponse) =>
      setData((previous) => (previous ? { ...previous, documents: { ...previous.documents, [step]: document } } : null)),
    []
  )

  return { data, isLoading, reload, setTicket, setDocument }
}

/** The agent's session that has a turn running, if any. */
export function workingSession(sessions: AgentSession[]): AgentSession | undefined {
  return sessions.find((session) => WORKING_SESSION.includes(session.status))
}
