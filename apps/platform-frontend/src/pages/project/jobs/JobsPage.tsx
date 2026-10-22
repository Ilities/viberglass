import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { SearchInput } from '@/components/search-input'
import { Select } from '@/components/select'
import { getProjectJobs } from '@/data'
import type { JobListItem } from '@/data'
import { useProject } from '@/context/project-context'
import { useDebounce } from '@/hooks/useDebounce'
import { getClankers } from '@/service/api/clanker-api'
import { JobsTable } from './jobs-table'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

const STATUSES = ['all', 'queued', 'active', 'completed', 'failed'] as const

/** `?status=` names a status; anything else means all of them. */
function resolveStatus(value: string | null): (typeof STATUSES)[number] {
  return STATUSES.find((status) => status === value) ?? 'all'
}

export function JobsPage() {
  const { project } = useParams<{ project: string }>()
  const { project: space } = useProject()
  const [searchParams, setSearchParams] = useSearchParams()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [agentNames, setAgentNames] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const status = resolveStatus(searchParams.get('status'))
  const search = searchParams.get('search') ?? ''

  // The box holds what is being typed; the URL catches up once the typing settles.
  const [searchInput, setSearchInput] = useState(search)
  const settledSearch = useDebounce(searchInput, 300)

  useEffect(() => {
    if (settledSearch !== searchInput) return
    if (settledSearch === search) return
    const next = new URLSearchParams(searchParams)
    if (settledSearch) next.set('search', settledSearch)
    else next.delete('search')
    setSearchParams(next, { replace: true })
  }, [settledSearch, searchInput, search, searchParams, setSearchParams])

  function setStatus(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('status')
    else next.set('status', value)
    setSearchParams(next)
  }

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      if (!project) return
      setIsLoading(true)
      setLoadError(null)
      try {
        const [j, agents] = await Promise.all([getProjectJobs(project, 50), getClankers(100).catch(() => [])])
        if (cancelled) return
        setJobs(j)
        setAgentNames(new Map(agents.map((agent) => [agent.id, agent.name])))
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Couldn't load the runs")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [project, reload])

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

      {loadError ? (
        <div className="mt-8 space-y-3 text-sm">
          <p className="text-red-700 dark:text-red-400">{loadError}</p>
          <Button outline onClick={() => setReload((count) => count + 1)}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-8 flex items-center gap-4">
            <div className="min-w-75 flex-2">
              <SearchInput
                placeholder="Search runs..."
                name="search"
                aria-label="Search runs"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Select name="status" aria-label="Filter by status" value={status} onChange={setStatus}>
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
      )}
    </>
  )
}
