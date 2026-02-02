'use client'

import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { getProjectJobs } from '@/data'
import type { JobListItem } from '@/data'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { JobsTable } from './jobs-table'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface JobsPageClientProps {
  project: string
}

export function JobsPageClient({ project }: JobsPageClientProps) {
  const searchParams = useSearchParams()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const status = searchParams.get('status') ?? ''
  const search = searchParams.get('search') ?? ''

  useEffect(() => {
    async function loadData() {
      const j = await getProjectJobs(project, 50)
      setJobs(j)
      setIsLoading(false)
    }
    loadData()
  }, [project])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  const filteredJobs = jobs.filter((job) => {
    if (status && job.status !== status) return false
    if (search) {
      const searchLower = search.toLowerCase()
      const matchesTask = job.task.toLowerCase().includes(searchLower)
      const matchesRepo = job.repository.toLowerCase().includes(searchLower)
      const matchesTicket = job.ticket?.title.toLowerCase().includes(searchLower) ?? false
      if (!matchesTask && !matchesRepo && !matchesTicket) return false
    }
    return true
  })

  return (
    <>
      <div className="flex items-end justify-between">
        <Heading>Jobs</Heading>
        <div className="flex gap-4">
          <Button href={`/project/${project}`}>Back to Project</Button>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <div className="min-w-75 flex-2">
          <div className="relative">
            <Input type="search" placeholder="Search jobs..." className="pl-10" name="search" defaultValue={search} />
            <MagnifyingGlassIcon className="absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          </div>
        </div>
        <Select name="status" defaultValue={status}>
          <option value="all">All Status</option>
          <option value="queued">Queued</option>
          <option value="active">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </Select>
      </div>

      {filteredJobs.length > 0 ? (
        <JobsTable jobs={filteredJobs} project={project} />
      ) : (
        <div className="mt-8 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">
            {jobs.length === 0 ? 'No jobs found for this project.' : 'No jobs found matching your criteria.'}
          </p>
        </div>
      )}
    </>
  )
}
