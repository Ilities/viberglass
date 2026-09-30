import { Badge } from '@/components/badge'
import { Fact, FactList } from '@/components/fact-list'
import { JobStatusIndicator } from '@/components/job-status-indicator'
import { Link } from '@/components/link'
import type { JobStatus } from '@/service/api/job-api'
import type { ReactNode } from 'react'

/** A repository identifier (URL, host/owner/repo or owner/repo) as a browsable URL; owner/repo means GitHub. */
function repositoryUrl(repository: string): string {
  if (repository.startsWith('http://') || repository.startsWith('https://')) return repository
  if (repository.includes('.')) return `https://${repository}`
  return `https://github.com/${repository}`
}

export function formatRunDuration(start: string | null, end: string | null): string | null {
  if (!start) return null
  const seconds = Math.floor(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function isHeartbeatStale(job: JobStatus): boolean {
  if (job.status !== 'active') return false
  if (!job.lastHeartbeat) return true
  return new Date(job.lastHeartbeat).getTime() < Date.now() - 5 * 60 * 1000
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
      {children}
    </a>
  )
}

/** Where and how this run ran, as quiet label and value pairs. */
export function RunFacts({ job, isPolling }: { job: JobStatus; isPolling: boolean }) {
  const repository = job.data.repository
  const repoUrl = repository ? repositoryUrl(repository) : null
  const baseBranch = job.data.baseBranch || 'main'
  const duration = formatRunDuration(job.processedAt, job.finishedAt)

  return (
    <FactList title="This run">
        <Fact label="Status">
          <JobStatusIndicator status={job.status} isPolling={isPolling} />
        </Fact>
        {job.clanker && (
          <Fact label="Agent">
            <Link href={`/settings/agents/${job.clanker.slug}`} className="text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
              {job.clanker.name}
            </Link>
            {job.clanker.agent && <span className="text-[var(--gray-9)]"> · {job.clanker.agent}</span>}
          </Fact>
        )}
        {repoUrl && (
          <Fact label="Repository">
            <ExternalLink href={repoUrl}>{repository.replace(/^https?:\/\/(www\.)?github\.com\//, '')}</ExternalLink>
          </Fact>
        )}
        {repoUrl && (
          <Fact label="Base branch">
            <ExternalLink href={`${repoUrl}/tree/${baseBranch}`}>
              <span className="font-mono text-[13px]">{baseBranch}</span>
            </ExternalLink>
          </Fact>
        )}
        {repoUrl && job.result?.branch && (
          <Fact label="Branch">
            <ExternalLink href={`${repoUrl}/tree/${job.result.branch}`}>
              <span className="font-mono text-[13px]">{job.result.branch}</span>
            </ExternalLink>
          </Fact>
        )}
        {repoUrl && job.result?.commitHash && (
          <Fact label="Commit">
            <ExternalLink href={`${repoUrl}/commit/${job.result.commitHash}`}>
              <span className="font-mono text-[13px]">{job.result.commitHash.slice(0, 10)}</span>
            </ExternalLink>
          </Fact>
        )}
        <Fact label="Started">
          {job.processedAt ? new Date(job.processedAt).toLocaleString() : 'Not yet'}
        </Fact>
        {duration && <Fact label={job.finishedAt ? 'Took' : 'Running for'}>{duration}</Fact>}
        {job.status === 'active' && (
          <Fact label="Last heard">
            {job.lastHeartbeat ? new Date(job.lastHeartbeat).toLocaleTimeString() : 'Not yet'}
            {isHeartbeatStale(job) && (
              <Badge color="amber" className="ml-2">
                Quiet for 5+ min
              </Badge>
            )}
          </Fact>
        )}
        <Fact label="Run ID">
          <span className="font-mono text-xs text-[var(--gray-10)]">{job.jobId}</span>
        </Fact>
    </FactList>
  )
}
