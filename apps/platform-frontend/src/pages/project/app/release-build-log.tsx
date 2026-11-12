import { getReleaseBuildLog } from '@/service/api/app-api'
import { useEffect, useState } from 'react'

/** A release's build output, loaded when it's opened. */
export function ReleaseBuildLog({ projectId, releaseId }: { projectId: string; releaseId: string }) {
  const [log, setLog] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getReleaseBuildLog(projectId, releaseId)
      .then((loaded) => !cancelled && setLog(loaded))
      .catch((failure: unknown) => !cancelled && setError(failure instanceof Error ? failure.message : "Couldn't load the build log"))
    return () => {
      cancelled = true
    }
  }, [projectId, releaseId])

  if (error) return <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
  if (log === undefined) return <p className="text-sm text-[var(--gray-10)]">Loading the build log…</p>
  return (
    <pre className="max-h-96 overflow-auto font-mono text-xs whitespace-pre-wrap text-[var(--gray-12)]">
      {log?.trim() || 'This build left no output.'}
    </pre>
  )
}
