import { useEffect, useState } from 'react'
import { JobListResponse, getJobs } from '@/service/api/job-api'
import { JobsTable } from '../jobs/jobs-table'
import { EmptyState } from '@/components/empty-state'
import { GearIcon } from '@radix-ui/react-icons'
import { Spinner } from '@/components/spinner'

interface TicketJobsTabProps {
  ticketId: string
  project: string
}

export function TicketJobsTab({ ticketId, project }: TicketJobsTabProps) {
  const [jobsData, setJobsData] = useState<JobListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchJobs() {
      try {
        setLoading(true)
        setError(null)
        const response = await getJobs({ ticketId, limit: 50 })
        setJobsData(response)
      } catch (err) {
        console.error('Failed to fetch jobs for ticket:', err)
        setError('Failed to load jobs for this ticket.')
      } finally {
        setLoading(false)
      }
    }

    if (ticketId) {
      fetchJobs()
    }
  }, [ticketId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-7">
        <EmptyState
          icon={<GearIcon className="h-10 w-10 text-[var(--gray-8)]" />}
          title="Unable to load jobs"
          description={error}
        />
      </div>
    )
  }

  if (!jobsData || jobsData.jobs.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-7">
        <EmptyState
          icon={<GearIcon className="h-10 w-10 text-[var(--gray-8)]" />}
          title="No jobs found"
          description="There are no jobs associated with this ticket yet."
        />
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-7">
      <h3 className="mb-4 text-sm font-semibold text-[var(--gray-12)]">Associated Jobs</h3>
      <JobsTable jobs={jobsData.jobs} project={project} />
      
      {jobsData.count > jobsData.jobs.length && (
        <div className="mt-4 text-center text-sm text-[var(--gray-9)]">
          Showing {jobsData.jobs.length} of {jobsData.count} jobs
        </div>
      )}
    </div>
  )
}