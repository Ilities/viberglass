import { getClankersList } from '@/data'
import { getJobs, type JobListItem, type JobStatus } from '@/service/api/job-api'
import { getPlanningPhase, getTicket, type PhaseDocumentResponse } from '@/service/api/ticket-api'
import type { Clanker, Ticket } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'

export interface RunContext {
  ticket: Ticket | null
  taskRuns: JobListItem[]
  document: PhaseDocumentResponse | null
  clankers: Clanker[]
}

const EMPTY: RunContext = { ticket: null, taskRuns: [], document: null, clankers: [] }

async function loadDocument(ticketId: string, jobKind: JobStatus['jobKind']): Promise<PhaseDocumentResponse | null> {
  if (jobKind === 'planning') return (await getPlanningPhase(ticketId)).document
  return null
}

/** The task around a run: the task, its other runs and its document for the run's phase. */
export function useRunContext(job: Pick<JobStatus, 'jobId' | 'jobKind' | 'status' | 'ticketId'> | null) {
  const [context, setContext] = useState<RunContext>(EMPTY)
  const ticketId = job?.ticketId ?? null
  const jobKind = job?.jobKind
  const status = job?.status

  const load = useCallback(async () => {
    if (!ticketId || !jobKind) {
      setContext(EMPTY)
      return
    }
    const [ticket, runs, document, clankers] = await Promise.all([
      getTicket(ticketId),
      getJobs({ ticketId, limit: 50 }),
      loadDocument(ticketId, jobKind),
      getClankersList(),
    ])
    setContext({ ticket, taskRuns: runs.jobs, document, clankers })
  }, [ticketId, jobKind])

  // Reload when the run changes state: a finished run may have written the document.
  useEffect(() => {
    void load().catch(() => setContext(EMPTY))
  }, [load, status])

  return { ...context, reload: load }
}

/** The newest run of the same kind on the task, if it came after this one. */
export function findNewerRun(job: Pick<JobStatus, 'jobId' | 'jobKind' | 'createdAt'>, taskRuns: JobListItem[]): string | null {
  const created = new Date(job.createdAt).getTime()
  const newer = taskRuns
    .filter((run) => run.jobKind === job.jobKind && run.jobId !== job.jobId && new Date(run.createdAt).getTime() > created)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return newer[0]?.jobId ?? null
}
