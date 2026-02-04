import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableRow } from '@/components/table'
import { formatJobStatus, getJobDetails } from '@/data'
import type { JobStatus } from '@/data'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

export function JobDetailPage() {
  const { project, jobId } = useParams<{ project: string; jobId: string }>()
  const [job, setJob] = useState<JobStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const j = await getJobDetails(jobId!)
      setJob(j)
      setIsLoading(false)
    }
    loadData()
  }, [jobId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!job) {
    return null
  }

  const statusInfo = formatJobStatus(job.status)

  return (
    <>
      <div className="flex items-center gap-4">
        <Button href={`/project/${project}/jobs`} plain>
          <ArrowLeftIcon className="h-5 w-5" />
          Back to Jobs
        </Button>
      </div>

      <div className="mt-8">
        <Heading>Job {jobId}</Heading>
        <div className="mt-4 flex items-center gap-4">
          <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
        </div>
      </div>

      <div className="mt-8">
        <Subheading>Output</Subheading>
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          <pre className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {job.output || 'No output yet'}
          </pre>
        </div>
      </div>
    </>
  )
}
