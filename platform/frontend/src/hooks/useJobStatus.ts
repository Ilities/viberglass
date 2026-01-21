import { useState } from 'react'
import { usePolling } from './usePolling'
import { getJob, JobStatus } from '@/service/api/job-api'
import { toast } from 'sonner'

export interface UseJobStatusResult {
  /** Latest job data from polling */
  job: JobStatus | null
  /** Is a poll request currently in flight */
  isLoading: boolean
  /** Error from last poll attempt */
  error: Error | null
  /** Is polling currently active */
  isPolling: boolean
  /** Manually trigger a poll */
  refetch: () => Promise<void>
}

/**
 * Job-specific polling hook with toast notifications.
 *
 * This hook polls job status every 3 seconds and shows toast notifications
 * when jobs complete or fail. Polling stops automatically when the job
 * reaches a terminal state (completed or failed).
 *
 * Toast notifications only appear on status changes, not on initial mount.
 *
 * @param jobId - The job ID to poll for status (can be undefined during initial render)
 * @returns Job state and control functions
 */
export function useJobStatus(jobId: string | undefined): UseJobStatusResult {
  // Track previous status to detect changes for toast notifications
  const [previousStatus, setPreviousStatus] = useState<string | null>(null)

  // Use the generic polling hook
  const { data, error, isPolling, refetch } = usePolling<JobStatus>({
    fn: () => getJob(jobId!),
    interval: 3000, // 3 seconds
    immediate: true,
    enabled: !!jobId, // Only poll if jobId exists
    onComplete: (job) => {
      const isTerminal = job.status === 'completed' || job.status === 'failed'
      const statusChanged = previousStatus !== null && previousStatus !== job.status

      // Show toast notification on status change to terminal state
      if (isTerminal && statusChanged) {
        if (job.status === 'completed') {
          toast.success('Job completed successfully', {
            description: 'Your changes have been applied',
            action: job.result?.pullRequestUrl
              ? {
                  label: 'View PR',
                  onClick: () => window.open(job.result!.pullRequestUrl!, '_blank'),
                }
              : undefined,
          })
        } else if (job.status === 'failed') {
          toast.error('Job failed', {
            description: job.result?.errorMessage || job.failedReason || 'An error occurred',
          })
        }
      }

      // Update previous status for next comparison
      setPreviousStatus(job.status)

      // Stop polling when terminal state is reached
      return isTerminal
    },
  })

  return {
    job: data,
    isLoading: !data && !error,
    error,
    isPolling,
    refetch,
  }
}
