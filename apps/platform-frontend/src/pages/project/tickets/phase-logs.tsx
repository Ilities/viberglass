import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { JobStatusIndicator } from '@/components/job-status-indicator'
import { formatTimestamp } from '@/data'
import { JobListItem } from '@/service/api/job-api'
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon, ListBulletIcon } from '@radix-ui/react-icons'
import { useState } from 'react'

interface PhaseLogsProps {
  jobs: JobListItem[]
  phase: 'research' | 'planning' | 'execution'
  project: string
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '-'
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  const durationMs = endTime - startTime
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function formatJobKind(kind: 'research' | 'execution' | 'planning' | 'claw'): string {
  switch (kind) {
    case 'research':
      return 'Research'
    case 'execution':
      return 'Execution'
    case 'planning':
      return 'Planning'
    case 'claw':
      return 'Scheduled'
  }
}

function jobKindBadgeColor(kind: 'research' | 'execution' | 'planning' | 'claw') {
  if (kind === 'research') return 'blue' as const
  if (kind === 'planning') return 'teal' as const
  if (kind === 'claw') return 'amber' as const
  return 'violet' as const
}

export function PhaseLogs({ jobs, phase, project }: PhaseLogsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const phaseJobs = jobs.filter((job) => job.jobKind === phase)

  if (phaseJobs.length === 0) {
    return null
  }

  const latestRun = phaseJobs[0]
  const statusLabel = latestRun.status === 'completed'
    ? 'completed'
    : latestRun.status === 'failed'
      ? 'failed'
      : latestRun.status === 'queued' || latestRun.status === 'active'
        ? 'in progress'
        : latestRun.status

  return (
    <div className="rounded-lg border border-[var(--gray-5)] bg-[var(--gray-1)]">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--gray-2)]"
      >
        <div className="flex items-center gap-2">
          <ListBulletIcon className="h-4 w-4 text-[var(--gray-9)]" />
          <span className="text-sm font-medium text-[var(--gray-12)]">
            Agent Runs
          </span>
          <Badge color="zinc">{phaseJobs.length}</Badge>
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 text-[var(--gray-9)]" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-[var(--gray-9)]" />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--gray-9)]">
          <span>
            Latest: {statusLabel} · {formatTimestamp(latestRun.createdAt)}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--gray-5)]">
          {phaseJobs.map((job, index) => (
            <div
              key={job.jobId}
              className="flex items-center justify-between border-b border-[var(--gray-4)] px-4 py-2.5 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <JobStatusIndicator status={job.status} />
                <div className="flex items-center gap-2">
                  <Badge color={jobKindBadgeColor(job.jobKind)} className="text-xs">
                    {formatJobKind(job.jobKind)}
                  </Badge>
                  <span className="text-sm text-[var(--gray-12)]">
                    Run #{phaseJobs.length - index}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-[var(--gray-9)]">
                  {formatDuration(job.processedAt, job.finishedAt)}
                </span>
                <span className="text-xs text-[var(--gray-9)]">
                  {formatTimestamp(job.createdAt)}
                </span>
                <Button
                  plain
                  href={`/project/${project}/jobs/${job.jobId}`}
                  target="_blank"
                  className="text-xs"
                >
                  <ExternalLinkIcon className="h-3 w-3" />
                  View
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface TicketLogsSummaryProps {
  jobs: JobListItem[]
  project: string
}

export function TicketLogsSummary({ jobs }: TicketLogsSummaryProps) {
  const researchCount = jobs.filter((j) => j.jobKind === 'research').length
  const planningCount = jobs.filter((j) => j.jobKind === 'planning').length
  const executionCount = jobs.filter((j) => j.jobKind === 'execution').length
  const total = jobs.length

  if (total === 0) return null

  return (
    <div className="flex items-center gap-4 text-xs text-[var(--gray-9)]">
      <span className="font-medium text-[var(--gray-11)]">{total} total runs</span>
      {researchCount > 0 && <Badge color="blue">{researchCount} research</Badge>}
      {planningCount > 0 && <Badge color="teal">{planningCount} planning</Badge>}
      {executionCount > 0 && <Badge color="violet">{executionCount} execution</Badge>}
    </div>
  )
}