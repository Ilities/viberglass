import { Link } from '@/components/link'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { SearchInput } from '@/components/search-input'
import { Select } from '@/components/select'
import { getProjectJobs } from '@/data'
import type { JobListItem } from '@/data'
import { useProject } from '@/context/project-context'
import { getClankers } from '@/service/api/clanker-api'
import { JobsTable } from './jobs-table'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

export function JobsPage() {
  const { project } = useParams<{ project: string }>()
  const { project: space } = useProject()
  const [searchParams] = useSearchParams()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [agentNames, setAgentNames] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  const status = searchParams.get('status') ?? 'all'
  const search = searchParams.get('search') ?? ''

  useEffect(() => {
    async function loadData() {
      if (!project) return
      const [j, agents] = await Promise.all([getProjectJobs(project, 50), getClankers(100).catch(() => [])])
      setJobs(j)
      setAgentNames(new Map(agents.map((agent) => [agent.id, agent.name])))
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
    if (status !== 'all' && job.status !== status) return false
    if (search) {
      const searchLower = search.toLowerCase()
      const matchesTask = job.task.toLowerCase().includes(searchLower)
      const matchesRepo = job.repository.toLowerCase().includes(searchLower)
      const matchesTicket = job.ticket?.title.toLowerCase().includes(searchLower) ?? false
      if (!matchesTask && !matchesRepo && !matchesTicket) return false
    }
    return true
  })

  if (!project) {
    return null
  }

  return (
    <>
      <PageMeta title={`${space?.name ?? project} | Runs`} />
      <PageHeader
        eyebrow={
          <Link href={`/spaces/${project}`} className="hover:underline">
            {space?.name ?? project}
          </Link>
        }
        title="Runs"
        className="mb-0"
      />

      <div className="mt-8 flex items-center gap-4">
        <div className="min-w-75 flex-2">
          <SearchInput
            placeholder="Search runs..."
            name="search"
            defaultValue={search}
          />
        </div>
        <Select name="status" defaultValue={status}>
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="active">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </Select>
      </div>

      {filteredJobs.length > 0 ? (
        <JobsTable jobs={filteredJobs} project={project} agentNames={agentNames} />
      ) : (
        <div className="mt-8 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">
            {jobs.length === 0 ? 'No runs found for this space.' : 'No runs found matching your criteria.'}
          </p>
        </div>
      )}
    </>
  )
}
