'use client'

import { useParams } from 'next/navigation'
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { useJobStatus } from '@/hooks/useJobStatus'
import { JobStatusIndicator } from '@/components/job-status-indicator'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableRow } from '@/components/table'
import { JobRefreshButton } from './job-refresh-button'

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

export default function JobDetailPage() {
  const { jobId, project } = useParams<{ project: string; jobId: string }>()

  // Always call the hook - useParams can return undefined during initial render
  // We'll handle the undefined case by passing empty string or using a fallback
  const { job, isLoading, error, isPolling } = useJobStatus(jobId || '')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-zinc-500 dark:text-zinc-400">Loading job details...</div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600 dark:text-red-400">Job not found</div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Button href={`/project/${project}/tickets`} plain>
          <ArrowLeftIcon className="h-5 w-5" />
          Back to Tickets
        </Button>
      </div>

      <div className="mt-8 flex items-start justify-between">
        <div className="flex-1">
          <Heading>Job {job.jobId}</Heading>
          <div className="mt-4 flex items-center gap-4">
            <JobStatusIndicator status={job.status} isPolling={isPolling} />
          </div>
        </div>
        <div className="flex gap-2">
          {job.result?.pullRequestUrl && (
            <Button href={job.result.pullRequestUrl} target="_blank" color="brand">
              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
              View Pull Request
            </Button>
          )}
          <JobRefreshButton />
        </div>
      </div>

      {/* Task Description */}
      <div className="mt-8">
        <Subheading>Task</Subheading>
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{job.data.task}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Results (if completed) */}
        {job.result && (
          <div className="lg:col-span-2">
            <Subheading>Results</Subheading>
            <div className="mt-4 space-y-4">
              {job.result.success ? (
                <>
                  {job.result.branch && (
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Branch</h4>
                      <p className="mt-1 font-mono text-sm text-zinc-600 dark:text-zinc-400">
                        {job.result.branch}
                      </p>
                    </div>
                  )}
                  {job.result.commitHash && (
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Commit</h4>
                      <p className="mt-1 font-mono text-sm text-zinc-600 dark:text-zinc-400">
                        {job.result.commitHash}
                      </p>
                    </div>
                  )}
                  {job.result.changedFiles && job.result.changedFiles.length > 0 && (
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-white">
                        Changed Files ({job.result.changedFiles.length})
                      </h4>
                      <ul className="mt-2 space-y-1">
                        {job.result.changedFiles.map((file, index) => (
                          <li key={index} className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
                            {file}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
                  <h4 className="text-sm font-medium text-red-900 dark:text-red-200">Error</h4>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    {job.result.errorMessage || job.failedReason || 'Unknown error'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Message (if failed without result) */}
        {job.status === 'failed' && !job.result && job.failedReason && (
          <div className="lg:col-span-2">
            <Subheading>Error</Subheading>
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
              <p className="text-sm text-red-700 dark:text-red-300">{job.failedReason}</p>
            </div>
          </div>
        )}

        {/* Progress (if active) */}
        {job.status === 'active' && job.progress && (
          <div className="lg:col-span-2">
            <Subheading>Progress</Subheading>
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {(job.progress as { message?: string }).message || 'Processing...'}
              </p>
            </div>
          </div>
        )}

        {/* Job Details */}
        <div>
          <Subheading>Details</Subheading>
          <Table className="mt-4">
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Job ID</TableCell>
                <TableCell className="font-mono text-xs">{job.jobId}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Repository</TableCell>
                <TableCell className="break-all text-sm">{job.data.repository}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Base Branch</TableCell>
                <TableCell>{job.data.baseBranch || 'main'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Created</TableCell>
                <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
              </TableRow>
              {job.processedAt && (
                <TableRow>
                  <TableCell className="font-medium">Started</TableCell>
                  <TableCell>{new Date(job.processedAt).toLocaleString()}</TableCell>
                </TableRow>
              )}
              {job.finishedAt && (
                <TableRow>
                  <TableCell className="font-medium">Finished</TableCell>
                  <TableCell>{new Date(job.finishedAt).toLocaleString()}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell className="font-medium">Duration</TableCell>
                <TableCell>{formatDuration(job.processedAt, job.finishedAt)}</TableCell>
              </TableRow>
              {job.result?.executionTime && (
                <TableRow>
                  <TableCell className="font-medium">Execution Time</TableCell>
                  <TableCell>{Math.round(job.result.executionTime / 1000)}s</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
