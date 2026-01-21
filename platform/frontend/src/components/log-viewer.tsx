'use client'

import { Badge } from '@/components/badge'
import { Subheading } from '@/components/heading'
import type { LogEntry } from '@/service/api/job-api'

export interface LogViewerProps {
  logs: LogEntry[]
  isConnected?: boolean
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
 * Color mapping for log levels
 */
const levelConfig: Record<
  LogEntry['level'],
  { color: Parameters<typeof Badge>[0]['color']; label: string }
> = {
  info: { color: 'zinc', label: 'INFO' },
  warn: { color: 'yellow', label: 'WARN' },
  error: { color: 'red', label: 'ERROR' },
  debug: { color: 'zinc', label: 'DEBUG' },
}

/**
 * Log viewer component with color-coded log levels and live indicator
 */
export function LogViewer({ logs, isConnected = false }: LogViewerProps) {
  return (
    <div className="lg:col-span-3">
      <div className="flex items-center justify-between">
        <Subheading>Logs</Subheading>
        {isConnected && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Live</span>
          </div>
        )}
      </div>

      {!logs || logs.length === 0 ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No logs available</p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-900 dark:border-zinc-700 dark:bg-zinc-950">
          <pre className="overflow-auto max-h-96 p-4 font-mono text-sm text-zinc-100 dark:text-zinc-100">
            {logs.map((log) => {
              const config = levelConfig[log.level]
              return (
                <div key={log.id} className="flex gap-3 py-0.5">
                  <span className="text-zinc-500 select-none">{formatTime(log.createdAt)}</span>
                  <Badge color={config.color} className="shrink-0">
                    {config.label}
                  </Badge>
                  <span className="flex-1 text-zinc-300">{log.message}</span>
                  {log.source && (
                    <span className="text-zinc-600 text-xs shrink-0">({log.source})</span>
                  )}
                </div>
              )
            })}
          </pre>
        </div>
      )}
    </div>
  )
}
