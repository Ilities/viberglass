import { getRunFiles, type RunFilesOutcome as Outcome } from '@/service/api/space-files-api'
import type { JobStatus } from '@/service/api/job-api'
import { savedFilesLine } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { TurnArtifactCard } from '../tickets/turn-artifact-card'

/** What a finished run in a Files space saved, and the artifacts it made. */
export function RunFilesOutcome({ job, space }: { job: Pick<JobStatus, 'jobId' | 'status'>; space: { id: string; slug: string } }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const finished = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'

  useEffect(() => {
    if (!finished) return
    getRunFiles(job.jobId)
      .then(setOutcome)
      .catch(() => setOutcome(null))
  }, [job.jobId, finished])

  if (!finished || !outcome) return null
  return (
    <section aria-label="Files" className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--gray-12)]">Files</h2>
      {outcome.artifacts.map((artifact) => (
        <TurnArtifactCard key={artifact.versionId} artifact={artifact} space={space} />
      ))}
      <p className="text-sm text-[var(--gray-11)]">
        {outcome.files
          ? savedFilesLine(outcome.files, job.status === 'cancelled' ? 'stopped' : 'failed')
          : "This run saved nothing, so the space's files are as they were before it."}
      </p>
    </section>
  )
}
