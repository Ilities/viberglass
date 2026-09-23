import { Badge } from '@/components/badge'
import { CheckCircledIcon, ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons'
import type { PhasePosition, PhaseStatus } from './phase-activity'

const PHASE_LABELS = {
  research: 'Research',
  planning: 'Planning',
  execution: 'Execution',
}

const PHASE_NUMBERS = {
  research: '1',
  planning: '2',
  execution: '3',
}

export function PhaseHeader({
  phase,
  position,
  status,
  isExpanded,
  onToggle,
}: {
  phase: 'research' | 'planning' | 'execution'
  position: PhasePosition
  status: PhaseStatus
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg border border-[var(--gray-5)] bg-[var(--gray-1)] px-4 py-3 text-left transition-colors hover:bg-[var(--gray-2)]"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{
            backgroundColor:
              position === 'completed'
                ? 'var(--green-9)'
                : position === 'current'
                  ? 'var(--accent-9)'
                  : 'var(--gray-4)',
            color: position === 'upcoming' ? 'var(--gray-9)' : 'white',
          }}
        >
          {position === 'completed' ? <CheckCircledIcon className="h-4 w-4" /> : <span>{PHASE_NUMBERS[phase]}</span>}
        </div>
        <span className="text-sm font-semibold text-[var(--gray-12)]">{PHASE_LABELS[phase]}</span>
        <Badge color={status.color} className="text-xs">
          {status.label}
        </Badge>
        {position === 'current' && <span className="text-xs text-[var(--accent-11)]">(Current)</span>}
      </div>
      <div className="flex items-center gap-2">
        {isExpanded ? (
          <ChevronDownIcon className="h-4 w-4 text-[var(--gray-9)]" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-[var(--gray-9)]" />
        )}
      </div>
    </button>
  )
}
