import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { InfoItem } from '@/components/info-item'
import { JobStatusIndicator } from '@/components/job-status-indicator'
import { Link } from '@/components/link'
import { LogViewer } from '@/components/log-viewer'
import { PageMeta } from '@/components/page-meta'
import { ProgressTimeline } from '@/components/progress-timeline'
import { Section } from '@/components/section'
import { TabButton } from '@/components/tab-button'
import { useJobStatus } from '@/hooks/useJobStatus'
import { JobRefreshButton } from './job-refresh-button'

import {
  ArrowLeftIcon,
  CalendarIcon,
  ChatBubbleIcon,
  CheckCircledIcon,
  ClockIcon,
  CommitIcon,
  CrossCircledIcon,
  CubeIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GearIcon,
  LightningBoltIcon,
  ListBulletIcon,
  Pencil1Icon,
  StackIcon,
  TimerIcon,
} from '@radix-ui/react-icons'
import { isObjectRecord } from '@viberglass/types'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

/**
 * Build a repository URL from a repository identifier.
 * Supports formats like:
 * - https://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo
 */
function buildRepoUrl(repository: string): string {
  if (repository.startsWith('http://') || repository.startsWith('https://')) {
    return repository
  }
  if (repository.includes('.')) {
    return `https://${repository}`
  }
  // Assume GitHub for owner/repo format
  return `https://github.com/${repository}`
}

/**
 * Build a branch URL for a repository
 */
function buildBranchUrl(repository: string, branch: string): string {
  const repoUrl = buildRepoUrl(repository)
  // Handle GitHub and GitLab style branch URLs
  return `${repoUrl}/tree/${branch}`
}

/**
 * Build a commit URL for a repository
 */
function buildCommitUrl(repository: string, commitHash: string): string {
  const repoUrl = buildRepoUrl(repository)
  return `${repoUrl}/commit/${commitHash}`
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '-'
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  const durationMs = endTime - startTime
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function isJobStale(lastHeartbeat: string | null, status: string): boolean {
  if (status !== 'active') return false
  if (!lastHeartbeat) return true
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  return new Date(lastHeartbeat).getTime() < fiveMinutesAgo
}

function formatJobId(jobId: string): string {
  // Show first 8 and last 6 characters
  if (jobId.length <= 20) return jobId
  return `${jobId.slice(0, 8)}...${jobId.slice(-6)}`
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

interface CodexDeviceAuthPrompt {
  verificationUri: string
  userCode: string
}

function resolveCodexDeviceAuthPrompt(
  progressUpdates: Array<{ details: Record<string, unknown> | null }>,
  currentProgress: Record<string, unknown> | null
): CodexDeviceAuthPrompt | null {
  const detailCandidates: Array<Record<string, unknown>> = []
  const currentDetails = currentProgress?.details

  if (isObjectRecord(currentDetails)) {
    detailCandidates.push(currentDetails)
  }

  for (let i = progressUpdates.length - 1; i >= 0; i -= 1) {
    const details = progressUpdates[i].details
    if (isObjectRecord(details)) {
      detailCandidates.push(details)
    }
  }

  for (const details of detailCandidates) {
    if (details.kind !== 'codex_device_auth_required' && details.kind !== 'codex_device_auth_pending') {
      continue
    }

    const verificationUri = readString(details.verificationUri)
    const userCode = readString(details.userCode)
    if (verificationUri && userCode) {
      return { verificationUri, userCode }
    }
  }

  return null
}

type TabType = 'overview' | 'timeline' | 'logs'

export function JobDetailPage() {
  const { project, jobId } = useParams<{ project: string; jobId: string }>()
  const { job, isLoading, error, isPolling, refetch } = useJobStatus(jobId)
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--gray-9)]">Loading job details...</div>
      </div>
    )
  }

  if (error || !job || !jobId || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600 dark:text-red-400">Job not found</div>
      </div>
    )
  }

  const hasResults = job.result && job.result.success
  const hasError = job.result && !job.result.success
  const showProgress = job.status === 'active' && job.progress
  const codexDeviceAuthPrompt = resolveCodexDeviceAuthPrompt(job.progressUpdates || [], job.progress)
  const progressMessage = readString(job.progress?.message) || 'Processing...'

  return (
    <>
      <PageMeta title={job ? `${job.jobId.slice(-6)} | Job` : 'Job'} />
      <div className="flex h-full flex-col">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-4">
          <Button href={`/project/${project}/jobs`} plain>
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Jobs
          </Button>
        </div>

        {/* Header Section */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Job Avatar */}
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-4)] to-[var(--accent-3)] text-[var(--accent-11)] shadow-sm">
                <GearIcon className="h-7 w-7" />
              </div>

              <div>
                <Heading className="text-2xl">Job {formatJobId(job.jobId)}</Heading>
                <div className="mt-1.5 flex items-center gap-3">
                  <JobStatusIndicator status={job.status} isPolling={isPolling} />
                  {job.ticket?.title && (
                    <span className="text-sm text-[var(--gray-9)]">
                      Ticket: <span className="font-medium text-[var(--gray-11)]">{job.ticket.title}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {job.result?.pullRequestUrl && (
                <Button href={job.result.pullRequestUrl} target="_blank" color="brand">
                  <ExternalLinkIcon className="h-4 w-4" />
                  View Pull Request
                </Button>
              )}
              <JobRefreshButton onRefresh={() => void refetch()} />
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mt-6 border-b border-[var(--gray-6)]">
            <div className="flex gap-1">
              <TabButton
                active={activeTab === 'overview'}
                onClick={() => setActiveTab('overview')}
                icon={<FileTextIcon className="h-4 w-4" />}
              >
                Overview
              </TabButton>
              <TabButton
                active={activeTab === 'timeline'}
                onClick={() => setActiveTab('timeline')}
                icon={<ListBulletIcon className="h-4 w-4" />}
              >
                Timeline
              </TabButton>
              <TabButton
                active={activeTab === 'logs'}
                onClick={() => setActiveTab('logs')}
                icon={<StackIcon className="h-4 w-4" />}
              >
                Logs
              </TabButton>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="min-h-0 flex-1">
          <div className="grid h-full gap-6 lg:grid-cols-12">
            {/* Left Sidebar - Job Info */}
            <div className="space-y-1 lg:col-span-4 xl:col-span-3">
              {/* Job Information Section */}
              <div className="app-frame rounded-lg p-4">
                <Section title="Job Information">
                  <InfoItem
                    icon={<StackIcon className="h-4 w-4" />}
                    label="Job ID"
                    value={<span className="font-mono text-xs">{job.jobId}</span>}
                  />
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem
                    icon={<CubeIcon className="h-4 w-4" />}
                    label="Repository"
                    value={
                      <a
                        href={buildRepoUrl(job.data.repository)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent-9)] hover:text-[var(--accent-10)] hover:underline"
                      >
                        {job.data.repository}
                      </a>
                    }
                  />
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem
                    icon={<CommitIcon className="h-4 w-4" />}
                    label="Base Branch"
                    value={
                      <a
                        href={buildBranchUrl(job.data.repository, job.data.baseBranch || 'main')}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent-9)] hover:text-[var(--accent-10)] hover:underline"
                      >
                        {job.data.baseBranch || 'main'}
                      </a>
                    }
                  />
                </Section>
              </div>

              {/* Clanker Section */}
              {job.clanker && (
                <div className="app-frame rounded-lg p-4">
                  <Section title="Clanker">
                    <InfoItem
                      icon={<GearIcon className="h-4 w-4" />}
                      label="Name"
                      value={
                        <Link
                          href={`/clankers/${job.clanker.slug}`}
                          className="text-[var(--accent-9)] hover:text-[var(--accent-10)] hover:underline"
                        >
                          {job.clanker.name}
                        </Link>
                      }
                    />
                    {job.clanker.agent && (
                      <>
                        <div className="mx-1 h-px bg-[var(--gray-6)]" />
                        <InfoItem icon={<GearIcon className="h-4 w-4" />} label="Agent" value={job.clanker.agent} />
                      </>
                    )}
                    {job.clanker.description && (
                      <>
                        <div className="mx-1 h-px bg-[var(--gray-6)]" />
                        <InfoItem
                          icon={<FileTextIcon className="h-4 w-4" />}
                          label="Description"
                          value={job.clanker.description}
                        />
                      </>
                    )}
                  </Section>
                </div>
              )}

              {/* Execution Section */}
              <div className="app-frame rounded-lg p-4">
                <Section title="Execution">
                  <InfoItem
                    icon={<CalendarIcon className="h-4 w-4" />}
                    label="Created"
                    value={new Date(job.createdAt).toLocaleString()}
                  />
                  {job.processedAt && (
                    <>
                      <div className="mx-1 h-px bg-[var(--gray-6)]" />
                      <InfoItem
                        icon={<ClockIcon className="h-4 w-4" />}
                        label="Started"
                        value={new Date(job.processedAt).toLocaleString()}
                      />
                    </>
                  )}
                  {job.finishedAt && (
                    <>
                      <div className="mx-1 h-px bg-[var(--gray-6)]" />
                      <InfoItem
                        icon={<CheckCircledIcon className="h-4 w-4" />}
                        label="Finished"
                        value={new Date(job.finishedAt).toLocaleString()}
                      />
                    </>
                  )}
                  <div className="mx-1 h-px bg-[var(--gray-6)]" />
                  <InfoItem
                    icon={<TimerIcon className="h-4 w-4" />}
                    label="Duration"
                    value={formatDuration(job.processedAt, job.finishedAt)}
                  />
                  {job.result?.executionTime && (
                    <>
                      <div className="mx-1 h-px bg-[var(--gray-6)]" />
                      <InfoItem
                        icon={<TimerIcon className="h-4 w-4" />}
                        label="Execution Time"
                        value={`${Math.round(job.result.executionTime / 1000)}s`}
                      />
                    </>
                  )}
                </Section>
              </div>

              {/* Status Section */}
              <div className="app-frame rounded-lg p-4">
                <Section title="Status">
                  <InfoItem
                    icon={<LightningBoltIcon className="h-4 w-4" />}
                    label="Last Heartbeat"
                    value={
                      <div className="flex items-center gap-2">
                        <span>{job.lastHeartbeat ? new Date(job.lastHeartbeat).toLocaleString() : 'Never'}</span>
                        {isJobStale(job.lastHeartbeat, job.status) && <Badge color="amber">Stale</Badge>}
                      </div>
                    }
                  />
                </Section>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-8 xl:col-span-9">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Task Section */}
                  <div className="app-frame rounded-lg p-6">
                    <Subheading className="mb-4 flex items-center gap-2">
                      <FileTextIcon className="h-5 w-5 text-[var(--accent-9)]" />
                      Task
                    </Subheading>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap text-[var(--gray-11)]">
                      {job.data.task}
                    </div>
                  </div>

                  {/* Additional Guidance Section */}
                  {((job.data.context?.instructionFiles?.length ?? 0) > 0 || job.data.context?.additionalContext) && (
                    <div className="app-frame rounded-lg border-[var(--accent-6)] p-6">
                      <Subheading className="mb-4 flex items-center gap-2 text-[var(--accent-10)]">
                        <Pencil1Icon className="h-5 w-5" />
                        Additional Guidance
                      </Subheading>
                      <div className="space-y-4">
                        {/* Additional Context from Enhance */}
                        {job.data.context?.additionalContext && (
                          <div className="rounded bg-[var(--accent-3)] p-3">
                            <div className="mb-2 flex items-center gap-2 text-xs tracking-wider text-[var(--accent-9)] uppercase">
                              <ChatBubbleIcon className="h-3 w-3" />
                              Additional Context
                            </div>
                            <div className="text-sm whitespace-pre-wrap text-[var(--gray-11)]">
                              {job.data.context.additionalContext}
                            </div>
                          </div>
                        )}
                        {/* Instruction Files */}
                        {job.data.context?.instructionFiles?.map((file, index) => (
                          <div key={`${file.fileType}-${index}`} className="rounded bg-[var(--gray-3)] p-3">
                            <div className="mb-2 text-xs tracking-wider text-[var(--gray-9)] uppercase">
                              File: {file.fileType}
                            </div>
                            {file.content && (
                              <div className="rounded bg-[var(--gray-4)] p-2 font-mono text-sm whitespace-pre-wrap text-[var(--gray-11)]">
                                {file.content}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Results Section */}
                  {hasResults && (
                    <div className="app-frame rounded-lg p-6">
                      <Subheading className="mb-4 flex items-center gap-2">
                        <CheckCircledIcon className="h-5 w-5 text-green-600" />
                        Results
                      </Subheading>
                      <div className="space-y-4">
                        {job.result?.branch && (
                          <div className="flex items-center gap-3 rounded bg-[var(--gray-3)] p-3">
                            <CommitIcon className="h-4 w-4 text-[var(--gray-8)]" />
                            <div>
                              <div className="text-xs tracking-wider text-[var(--gray-9)] uppercase">Branch</div>
                              <a
                                href={buildBranchUrl(job.data.repository, job.result.branch)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-sm text-[var(--accent-9)] hover:text-[var(--accent-10)] hover:underline"
                              >
                                {job.result.branch}
                              </a>
                            </div>
                          </div>
                        )}
                        {job.result?.commitHash && (
                          <div className="flex items-center gap-3 rounded bg-[var(--gray-3)] p-3">
                            <StackIcon className="h-4 w-4 text-[var(--gray-8)]" />
                            <div>
                              <div className="text-xs tracking-wider text-[var(--gray-9)] uppercase">Commit</div>
                              <a
                                href={buildCommitUrl(job.data.repository, job.result.commitHash)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-sm text-[var(--accent-9)] hover:text-[var(--accent-10)] hover:underline"
                              >
                                {job.result.commitHash}
                              </a>
                            </div>
                          </div>
                        )}
                        {job.result?.changedFiles && job.result.changedFiles.length > 0 && (
                          <div className="rounded bg-[var(--gray-3)] p-3">
                            <div className="mb-2 text-xs tracking-wider text-[var(--gray-9)] uppercase">
                              Changed Files ({job.result.changedFiles.length})
                            </div>
                            <ul className="space-y-1">
                              {job.result.changedFiles.map((file, index) => (
                                <li key={`${file}-${index}`} className="font-mono text-xs text-[var(--gray-11)]">
                                  {file}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error Section */}
                  {(hasError || (job.status === 'failed' && job.failedReason)) && (
                    <div className="app-frame rounded-lg border-red-200 p-6 dark:border-red-500/30">
                      <Subheading className="mb-4 flex items-center gap-2 text-red-600">
                        <CrossCircledIcon className="h-5 w-5" />
                        Error
                      </Subheading>
                      <div className="rounded bg-red-50 p-4 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">
                        {job.result?.errorMessage || job.failedReason || 'Unknown error'}
                      </div>
                    </div>
                  )}

                  {/* Active Progress */}
                  {showProgress && (
                    <div className="app-frame rounded-lg border-blue-200 p-6 dark:border-blue-500/30">
                      <Subheading className="mb-4 flex items-center gap-2 text-blue-600">
                        <ListBulletIcon className="h-5 w-5" />
                        Current Progress
                      </Subheading>
                      <div className="rounded bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
                        {progressMessage}
                      </div>
                    </div>
                  )}

                  {job.status === 'active' && codexDeviceAuthPrompt && (
                    <div className="app-frame rounded-lg border-[var(--amber-6)] p-6">
                      <Subheading className="mb-4 flex items-center gap-2 text-[var(--amber-11)]">
                        <ClockIcon className="h-5 w-5" />
                        Codex login required
                      </Subheading>
                      <div className="space-y-3 rounded-lg border border-[var(--amber-6)] bg-[var(--amber-3)] p-4 text-sm">
                        <div className="text-[var(--gray-12)]">
                          Open verification page:{' '}
                          <a
                            href={codexDeviceAuthPrompt.verificationUri}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-[var(--accent-9)] hover:text-[var(--accent-10)] hover:underline"
                          >
                            {codexDeviceAuthPrompt.verificationUri}
                          </a>
                        </div>
                        <div className="rounded border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-2 font-mono text-[var(--gray-12)] dark:bg-[var(--gray-4)]">
                          Code: <span className="font-bold">{codexDeviceAuthPrompt.userCode}</span>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            plain
                            onClick={() => {
                              void navigator.clipboard.writeText(codexDeviceAuthPrompt.userCode)
                            }}
                          >
                            Copy code
                          </Button>
                          <Button href={codexDeviceAuthPrompt.verificationUri} target="_blank" plain>
                            <ExternalLinkIcon className="h-4 w-4" />
                            Open link
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'timeline' && (
                <div className="app-frame rounded-lg p-6">
                  <ProgressTimeline updates={job.progressUpdates || []} currentStatus={job.status} />
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="app-frame rounded-lg p-6">
                  <LogViewer logs={job.logs || []} isConnected={isPolling && job.status === 'active'} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
