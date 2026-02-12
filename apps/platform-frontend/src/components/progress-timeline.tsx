import { Badge } from '@/components/badge'
import { Subheading } from '@/components/heading'
import type { ProgressUpdate } from '@/service/api/job-api'

export interface ProgressTimelineProps {
  updates: ProgressUpdate[]
  currentStatus: string
}

/**
 * Format timestamp to HH:MM:SS
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Progress timeline showing execution steps with latest update prominent
 * and full history below
 */
export function ProgressTimeline({ updates, currentStatus }: ProgressTimelineProps) {
  // Don't show progress for queued jobs
  if (currentStatus === 'queued') {
    return null
  }

  const latestUpdate = updates[0]
  const history = updates.slice(1)

  return (
    <div className="lg:col-span-2">
      <Subheading>Execution Progress</Subheading>

      {!updates || updates.length === 0 ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No progress updates yet</p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {/* Latest Update - Prominent */}
          {latestUpdate && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge color="blue">Latest</Badge>
                  <h4 className="font-medium text-blue-900 dark:text-blue-200">
                    {latestUpdate.step || 'System'}
                  </h4>
                </div>
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  {formatTime(latestUpdate.createdAt)}
                </span>
              </div>
              <p className="mt-2 text-sm text-blue-800 dark:text-blue-300">{latestUpdate.message}</p>
            </div>
          )}

          {/* Full History Timeline */}
          {history.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-4">
                Progress History
              </h4>
              <div className="space-y-3">
                {history.map((update, index) => (
                  <div key={index} className="flex gap-3">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                      {index < history.length - 1 && (
                        <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 min-h-[24px]" />
                      )}
                    </div>
                    {/* Update content */}
                    <div className="flex-1 pb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {update.step || 'System'}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {formatTime(update.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">{update.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
