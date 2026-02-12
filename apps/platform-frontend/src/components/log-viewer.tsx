import { Badge } from '@/components/badge'
import { Subheading } from '@/components/heading'
import type { LogEntry } from '@/service/api/job-api'
import { LayersIcon } from '@radix-ui/react-icons'

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
  { color: Parameters<typeof Badge>[0]['color']; label: string; bgColor: string }
> = {
  info: { color: 'zinc', label: 'INFO', bgColor: 'bg-[var(--gray-4)]' },
  warn: { color: 'amber', label: 'WARN', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  error: { color: 'red', label: 'ERROR', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  debug: { color: 'zinc', label: 'DEBUG', bgColor: 'bg-[var(--gray-4)]' },
}

/**
 * Log viewer component with color-coded log levels and live indicator
 */
export function LogViewer({ logs, isConnected = false }: LogViewerProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <Subheading className="flex items-center gap-2">
          <LayersIcon className="h-5 w-5 text-[var(--accent-9)]" />
          Execution Logs
        </Subheading>
        {isConnected && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs font-medium text-green-600">Live</span>
          </div>
        )}
      </div>

      {!logs || logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="text-[var(--gray-9)]">
            <LayersIcon className="h-10 w-10 mx-auto mb-3 text-[var(--gray-6)]" />
            <p className="text-sm">No logs available</p>
            <p className="text-xs mt-1 text-[var(--gray-8)]">Logs will appear here once the job starts</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] dark:bg-[var(--gray-3)]">
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-sm">
              <tbody>
                {logs.map((log, index) => {
                  const config = levelConfig[log.level]
                  const isEven = index % 2 === 0
                  return (
                    <tr 
                      key={log.id} 
                      className={`
                        ${isEven ? 'bg-transparent' : 'bg-[var(--gray-3)]/50 dark:bg-[var(--gray-4)]/30'}
                        hover:bg-[var(--accent-3)]/30 transition-colors
                      `}
                    >
                      <td className="py-2 px-4 text-[var(--gray-8)] tabular-nums text-xs whitespace-nowrap w-20">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="py-2 px-2 w-16">
                        <Badge 
                          color={config.color} 
                          className={`
                            text-[10px] px-1.5 py-0.5 font-mono font-bold
                            ${config.bgColor}
                          `}
                        >
                          {config.label}
                        </Badge>
                      </td>
                      <td className="py-2 px-4 text-[var(--gray-11)]">
                        {log.message}
                      </td>
                      {log.source && (
                        <td className="py-2 px-4 text-[var(--gray-8)] text-xs whitespace-nowrap text-right">
                          {log.source}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
