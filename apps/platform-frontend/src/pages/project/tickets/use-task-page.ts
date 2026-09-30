import { getClankersList, getTicketDetails } from '@/data'
import { getJobs, type JobListItem } from '@/service/api/job-api'
import { listSessionsForTicket, type AgentSession } from '@/service/api/session-api'
import { getPlanningPhase, getResearchDocument, type PhaseDocumentResponse } from '@/service/api/ticket-api'
import type { Clanker, Ticket } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'

export interface TaskPageData {
  ticket: Ticket
  clankers: Clanker[]
  /** Newest first. */
  runs: JobListItem[]
  documents: { research: PhaseDocumentResponse; planning: PhaseDocumentResponse }
  sessions: AgentSession[]
}

const POLL_MS = 5000
const OPEN_SESSION = ['active', 'waiting_on_user', 'waiting_on_approval']

async function loadTask(id: string): Promise<Omit<TaskPageData, 'clankers'> | null> {
  const [ticket, runs, research, planning, sessions] = await Promise.all([
    getTicketDetails(id),
    getJobs({ ticketId: id, limit: 50 }),
    getResearchDocument(id),
    getPlanningPhase(id),
    listSessionsForTicket(id),
  ])
  if (!ticket) return null
  return {
    ticket,
    runs: runs.jobs,
    documents: { research: research.document, planning: planning.document },
    sessions,
  }
}

/** Everything the task page shows, kept current while an agent works on it. */
export function useTaskPage(id: string | undefined) {
  const [data, setData] = useState<TaskPageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!id) return
    const task = await loadTask(id)
    if (task) setData((previous) => (previous ? { ...previous, ...task } : null))
  }, [id])

  useEffect(() => {
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
  }, [id])

  // While an agent works (a run or a live session), keep the page current without a reload.
  const isBusy =
    data?.runs.some((run) => run.status === 'queued' || run.status === 'active') ||
    data?.sessions.some((session) => OPEN_SESSION.includes(session.status)) ||
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

export function openSessionFor(sessions: AgentSession[], step: string): AgentSession | undefined {
  return sessions.find((session) => session.mode === step && OPEN_SESSION.includes(session.status))
}
