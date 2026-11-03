import { Button } from '@/components/button'
import { getAppLogs } from '@/service/api/app-api'
import { useState } from 'react'

export function AppLogs({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setLogs(await getAppLogs(projectId))
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load the app's logs")
    } finally {
      setLoading(false)
    }
  }

  return (
    <details
      className="mt-8 border-t border-[var(--gray-5)] pt-4"
      onToggle={(event) => {
        if (event.currentTarget.open && logs === null && !loading) void load()
      }}
    >
      <summary className="cursor-pointer text-sm font-medium text-[var(--gray-12)]">Logs</summary>
      <div className="mt-3 space-y-3">
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        {logs === null && !error ? (
          <p className="text-sm text-[var(--gray-10)]">Loading the logs…</p>
        ) : (
          logs !== null && (
            <pre className="max-h-96 overflow-auto rounded-md bg-[var(--gray-2)] p-3 font-mono text-xs whitespace-pre-wrap text-[var(--gray-12)]">
              {logs.trim() || 'Nothing logged yet.'}
            </pre>
          )
        )}
        <Button outline onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
    </details>
  )
}
