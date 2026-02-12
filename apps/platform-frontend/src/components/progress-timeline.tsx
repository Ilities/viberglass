import { Badge } from '@/components/badge'
import { Subheading } from '@/components/heading'
import type { ProgressUpdate } from '@/service/api/job-api'
import { 
  CheckCircledIcon, 
  ClockIcon, 
  GearIcon, 
  PlayIcon,
  DotFilledIcon
} from '@radix-ui/react-icons'

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

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function groupByDate(updates: ProgressUpdate[]): Map<string, ProgressUpdate[]> {
  const groups = new Map<string, ProgressUpdate[]>()
  
  updates.forEach(update => {
    const date = formatDate(update.createdAt)
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(update)
  })
  
  return groups
}

/**
 * Progress timeline showing execution steps with visual timeline
 */
export function ProgressTimeline({ updates, currentStatus }: ProgressTimelineProps) {
  // Don't show progress for queued jobs
  if (currentStatus === 'queued') {
    return (
      <div>
        <Subheading>Execution Timeline</Subheading>
        <div className="mt-4 p-6 text-center text-[var(--gray-9)]">
          <ClockIcon className="h-8 w-8 mx-auto mb-2 text-[var(--gray-7)]" />
          <p>Job is queued and waiting to start...</p>
        </div>
      </div>
    )
  }

  if (!updates || updates.length === 0) {
    return (
      <div>
        <Subheading>Execution Timeline</Subheading>
        <div className="mt-4 p-6 text-center text-[var(--gray-9)]">
          <GearIcon className="h-8 w-8 mx-auto mb-2 text-[var(--gray-7)]" />
          <p>No progress updates yet</p>
        </div>
      </div>
    )
  }

  const grouped = groupByDate(updates)
  const sortedDates = Array.from(grouped.keys()).sort((a, b) => {
    const dateA = new Date(grouped.get(a)![0].createdAt)
    const dateB = new Date(grouped.get(b)![0].createdAt)
    return dateB.getTime() - dateA.getTime()
  })

  return (
    <div>
      <Subheading className="flex items-center gap-2">
        <PlayIcon className="h-5 w-5 text-[var(--accent-9)]" />
        Execution Timeline
      </Subheading>

      <div className="mt-6 space-y-8">
        {sortedDates.map((date, dateIndex) => (
          <div key={date} className="relative">
            {/* Date Header */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--gray-9)]">
                {date}
              </span>
              <div className="flex-1 h-px bg-[var(--gray-6)]" />
            </div>

            {/* Timeline Items */}
            <div className="space-y-4">
              {grouped.get(date)!.map((update, index) => {
                const isLatest = dateIndex === 0 && index === 0
                return (
                  <TimelineItem 
                    key={`${date}-${index}`} 
                    update={update} 
                    isLatest={isLatest}
                    isLast={index === grouped.get(date)!.length - 1 && dateIndex === sortedDates.length - 1}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface TimelineItemProps {
  update: ProgressUpdate
  isLatest: boolean
  isLast: boolean
}

function TimelineItem({ update, isLatest }: TimelineItemProps) {
  return (
    <div className="flex gap-4 group">
      {/* Timeline Visual */}
      <div className="flex flex-col items-center">
        {/* Icon/dot */}
        <div className={`
          relative flex items-center justify-center w-8 h-8 rounded-full shrink-0
          transition-all duration-200
          ${isLatest 
            ? 'bg-[var(--accent-9)] text-white shadow-lg shadow-[var(--accent-9)]/30' 
            : 'bg-[var(--gray-4)] text-[var(--gray-9)] group-hover:bg-[var(--accent-4)] group-hover:text-[var(--accent-11)]'
          }
        `}>
          {isLatest ? (
            <PlayIcon className="h-4 w-4" />
          ) : (
            <CheckCircledIcon className="h-4 w-4" />
          )}
        </div>
        {/* Connecting line */}
        {!isLatest && (
          <div className="w-px flex-1 bg-[var(--gray-6)] min-h-[40px] mt-2" />
        )}
      </div>

      {/* Content */}
      <div className={`
        flex-1 pb-6 rounded-lg transition-colors duration-200
        ${isLatest ? 'bg-[var(--accent-3)]/50' : 'hover:bg-[var(--gray-3)]'}
        p-3 -m-3
      `}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isLatest && (
                <Badge color="amber" className="text-xs">Latest</Badge>
              )}
              <span className={`
                text-sm font-semibold
                ${isLatest ? 'text-[var(--accent-11)]' : 'text-[var(--gray-11)]'}
              `}>
                {update.step || 'System'}
              </span>
            </div>
            <p className={`
              text-sm leading-relaxed
              ${isLatest ? 'text-[var(--gray-12)]' : 'text-[var(--gray-10)]'}
            `}>
              {update.message}
            </p>
          </div>
          <span className={`
            text-xs font-medium tabular-nums shrink-0
            ${isLatest ? 'text-[var(--accent-10)]' : 'text-[var(--gray-8)]'}
          `}>
            {formatTime(update.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
}
