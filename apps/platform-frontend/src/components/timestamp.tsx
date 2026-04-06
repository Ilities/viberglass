import { formatTimestamp } from '@/lib/formatters'

interface TimestampProps {
  date: string | Date
  className?: string
}

export function Timestamp({ date, className }: TimestampProps) {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const fullDateTime = dateObj.toLocaleString()
  return (
    <time dateTime={dateObj.toISOString()} title={fullDateTime} className={className} style={{ position: 'relative', zIndex: 1 }}>
      {formatTimestamp(date)}
    </time>
  )
}
