import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { JobStatusIndicator } from '@/components/job-status-indicator'
import { PageMeta } from '@/components/page-meta'
import { LogViewer } from '@/components/log-viewer'
import { ProgressTimeline } from '@/components/progress-timeline'
import { Badge } from '@/components/badge'
import { InfoItem } from '@/components/info-item'
import { Section } from '@/components/section'
import { TabButton } from '@/components/tab-button'
import { JobRefreshButton } from './job-refresh-button'
import { useJobStatus } from '@/hooks/useJobStatus'

import { 
  ArrowLeftIcon, 
  ExternalLinkIcon, 
  ClockIcon, 
  CommitIcon, 
  CubeIcon,
  StackIcon,
  FileTextIcon,
  ListBulletIcon,
  CalendarIcon,
  TimerIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  GearIcon,
  LightningBoltIcon,
  RobotIcon,
  ChatBubbleIcon,
  PencilIcon
} from '@radix-ui/react-icons'
import { useParams } from 'react-router-dom'
import { useState } from 'react'

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

  return (
    <>
      <PageMeta title={job ? `${job.jobId.slice(-6)} | Job` : 'Job'} />
      <div className="h-full flex flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center gap-4 mb-6">
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
                    Ticket: <span className="text-[var(--gray-11)] font-medium">{job.ticket.title}</span>
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
      <div className="flex-1 min-h-0">
        <div className="grid gap-6 lg:grid-cols-12 h-full">
          {/* Left Sidebar - Job Info */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-1">
            {/* Job Information Section */}
            <div className="app-frame rounded-lg p-4">
              <Section title="Job Information">
                <InfoItem 
                  icon={<StackIcon className="h-4 w-4" />}
                  label="Job ID"
                  value={<span className="font-mono text-xs">{job.jobId}</span>}
                />
                <div className="h-px bg-[var(--gray-6)] mx-1" />
                <InfoItem 
                  icon={<CubeIcon className="h-4 w-4" />}
                  label="Repository"
                  value={job.data.repository}
                />
                <div className="h-px bg-[var(--gray-6)] mx-1" />
                <InfoItem 
                  icon={<CommitIcon className="h-4 w-4" />}
                  label="Base Branch"
                  value={job.data.baseBranch || 'main'}
                />
              </Section>
            </div>

            {/* Clanker Section */}
            {job.clanker && (
              <div className="app-frame rounded-lg p-4">
                <Section title="Clanker">
                  <InfoItem 
                    icon={<RobotIcon className="h-4 w-4" />}
                    label="Name"
                    value={job.clanker.name}
                  />
                  {job.clanker.agent && (
                    <>
                      <div className="h-px bg-[var(--gray-6)] mx-1" />
                      <InfoItem 
                        icon={<GearIcon className="h-4 w-4" />}
                        label="Agent"
                        value={job.clanker.agent}
                      />
                    </>
                  )}
                  {job.clanker.description && (
                    <>
                      <div className="h-px bg-[var(--gray-6)] mx-1" />
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
                    <div className="h-px bg-[var(--gray-6)] mx-1" />
                    <InfoItem 
                      icon={<ClockIcon className="h-4 w-4" />}
                      label="Started"
                      value={new Date(job.processedAt).toLocaleString()}
                    />
                  </>
                )}
                {job.finishedAt && (
                  <>
                    <div className="h-px bg-[var(--gray-6)] mx-1" />
                    <InfoItem 
                      icon={<CheckCircledIcon className="h-4 w-4" />}
                      label="Finished"
                      value={new Date(job.finishedAt).toLocaleString()}
                    />
                  </>
                )}
                <div className="h-px bg-[var(--gray-6)] mx-1" />
                <InfoItem 
                  icon={<TimerIcon className="h-4 w-4" />}
                  label="Duration"
                  value={formatDuration(job.processedAt, job.finishedAt)}
                />
                {job.result?.executionTime && (
                  <>
                    <div className="h-px bg-[var(--gray-6)] mx-1" />
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
                      {isJobStale(job.lastHeartbeat, job.status) && (
                        <Badge color="amber">Stale</Badge>
                      )}
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
                  <div className="prose prose-sm max-w-none text-[var(--gray-11)] whitespace-pre-wrap">
                    {job.data.task}
                  </div>
                </div>

                {/* Additional Guidance Section */}
                {(job.data.context?.instructionFiles?.length > 0 || job.data.context?.additionalContext) && (
                  <div className="app-frame rounded-lg p-6 border-[var(--accent-6)]">
                    <Subheading className="mb-4 flex items-center gap-2 text-[var(--accent-10)]">
                      <PencilIcon className="h-5 w-5" />
                      Additional Guidance
                    </Subheading>
                    <div className="space-y-4">
                      {/* Additional Context from Enhance */}
                      {job.data.context?.additionalContext && (
                        <div className="p-3 bg-[var(--accent-3)] rounded">
                          <div className="text-xs text-[var(--accent-9)] uppercase tracking-wider mb-2 flex items-center gap-2">
                            <ChatBubbleIcon className="h-3 w-3" />
                            Additional Context
                          </div>
                          <div className="text-sm text-[var(--gray-11)] whitespace-pre-wrap">
                            {job.data.context.additionalContext}
                          </div>
                        </div>
                      )}
                      {/* Instruction Files */}
                      {job.data.context?.instructionFiles?.map((file, index) => (
                        <div key={`${file.fileType}-${index}`} className="p-3 bg-[var(--gray-3)] rounded">
                          <div className="text-xs text-[var(--gray-9)] uppercase tracking-wider mb-2">
                            File: {file.fileType}
                          </div>
                          {file.content && (
                            <div className="text-sm text-[var(--gray-11)] whitespace-pre-wrap font-mono bg-[var(--gray-4)] p-2 rounded">
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
                        <div className="flex items-center gap-3 p-3 bg-[var(--gray-3)] rounded">
                          <CommitIcon className="h-4 w-4 text-[var(--gray-8)]" />
                          <div>
                            <div className="text-xs text-[var(--gray-9)] uppercase tracking-wider">Branch</div>
                            <div className="font-mono text-sm text-[var(--gray-12)]">{job.result.branch}</div>
                          </div>
                        </div>
                      )}
                      {job.result?.commitHash && (
                        <div className="flex items-center gap-3 p-3 bg-[var(--gray-3)] rounded">
                          <StackIcon className="h-4 w-4 text-[var(--gray-8)]" />
                          <div>
                            <div className="text-xs text-[var(--gray-9)] uppercase tracking-wider">Commit</div>
                            <div className="font-mono text-sm text-[var(--gray-12)]">{job.result.commitHash}</div>
                          </div>
                        </div>
                      )}
                      {job.result?.changedFiles && job.result.changedFiles.length > 0 && (
                        <div className="p-3 bg-[var(--gray-3)] rounded">
                          <div className="text-xs text-[var(--gray-9)] uppercase tracking-wider mb-2">
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
                  <div className="app-frame rounded-lg p-6 border-red-200 dark:border-red-500/30">
                    <Subheading className="mb-4 flex items-center gap-2 text-red-600">
                      <CrossCircledIcon className="h-5 w-5" />
                      Error
                    </Subheading>
                    <div className="p-4 bg-red-50 dark:bg-red-500/10 rounded text-red-800 dark:text-red-200 text-sm">
                      {job.result?.errorMessage || job.failedReason || 'Unknown error'}
                    </div>
                  </div>
                )}

                {/* Active Progress */}
                {showProgress && (
                  <div className="app-frame rounded-lg p-6 border-blue-200 dark:border-blue-500/30">
                    <Subheading className="mb-4 flex items-center gap-2 text-blue-600">
                      <ListBulletIcon className="h-5 w-5" />
                      Current Progress
                    </Subheading>
                    <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded text-blue-800 dark:text-blue-200 text-sm">
                      {(job.progress as { message?: string }).message || 'Processing...'}
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
