import { useCallback, useEffect, useRef, useState } from 'react'
import { getJob, JobStatus } from '@/service/api/job-api'
import { toast } from 'sonner'

export interface UseJobStatusResult {
  /** Latest job data from polling */
  job: JobStatus | null
  /** Is initial load in progress */
  isLoading: boolean
  /** Error from last fetch attempt */
  error: Error | null
  /** Is polling currently active */
  isPolling: boolean
  /** Manually trigger a fetch */
  refetch: () => Promise<void>
}

const POLL_INTERVAL = 3000

/**
 * Job-specific hook with initial fetch and polling for updates.
 *
 * This hook:
 * 1. Fetches job data immediately when jobId is available
 * 2. Polls for status/log updates every 3 seconds
 * 3. Shows toast notifications when jobs complete or fail
 * 4. Stops polling when job reaches terminal state (completed/failed)
 *
 * @param jobId - The job ID to poll for status (can be undefined during initial render)
 * @returns Job state and control functions
 */
export function useJobStatus(jobId: string | undefined): UseJobStatusResult {
  const [job, setJob] = useState<JobStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  const previousStatusRef = useRef<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Determine if job is in terminal state
  const isTerminal = job?.status === 'completed' || job?.status === 'failed'

  // Fetch job data and handle status changes
  const fetchJob = useCallback(async () => {
    if (!jobId) return

    try {
      const jobData = await getJob(jobId)
      setJob(jobData)
      setError(null)

      // Check for status change to terminal state for toast
      const prevStatus = previousStatusRef.current
      const statusChanged = prevStatus !== null && prevStatus !== jobData.status
      const nowTerminal = jobData.status === 'completed' || jobData.status === 'failed'

      if (nowTerminal && statusChanged) {
        if (jobData.status === 'completed') {
          toast.success('Job completed successfully', {
            description: 'Your changes have been applied',
            action: jobData.result?.pullRequestUrl
              ? {
                  label: 'View PR',
                  onClick: () => window.open(jobData.result!.pullRequestUrl!, '_blank'),
                }
              : undefined,
          })
        } else if (jobData.status === 'failed') {
          toast.error('Job failed', {
            description: jobData.result?.errorMessage || jobData.failedReason || 'An error occurred',
          })
        }
      }

      previousStatusRef.current = jobData.status
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch job'))
    }
  }, [jobId])

  // Initial fetch when jobId becomes available
  useEffect(() => {
    if (!jobId) {
      setJob(null)
      setError(null)
      setIsLoading(true)
      previousStatusRef.current = null
      return
    }

    // Reset and fetch for new jobId
    setIsLoading(true)
    previousStatusRef.current = null

    getJob(jobId)
      .then((jobData) => {
        setJob(jobData)
        previousStatusRef.current = jobData.status
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error('Failed to fetch job'))
        setIsLoading(false)
      })
  }, [jobId])

  // Set up polling interval
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Don't poll if no jobId or job is in terminal state
    if (!jobId || isTerminal) {
      setIsPolling(false)
      return
    }

    // Start polling
    setIsPolling(true)
    intervalRef.current = setInterval(() => {
      fetchJob()
    }, POLL_INTERVAL)

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [jobId, isTerminal, fetchJob])

  // Manual refetch
  const refetch = useCallback(async () => {
    if (!jobId) return
    setIsLoading(true)
    await fetchJob()
    setIsLoading(false)
  }, [jobId, fetchJob])

  return {
    job,
    isLoading,
    error,
    isPolling,
    refetch,
  }
}
