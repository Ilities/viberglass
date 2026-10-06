import { onTabListKeyDown } from '@/components/tab-button'
import { CheckIcon } from '@radix-ui/react-icons'
import clsx from 'clsx'
import { describeStep, STEP_NAME, TASK_STEPS, type TaskNextMove, type TaskStep } from './task-next-move'
import { stepPanelId, stepTabId } from './task-step-view'

interface TaskStepperProps {
  currentStep: TaskStep
  move: TaskNextMove
  shownStep: TaskStep
  /** Which artifacts exist: a document with content, or a pull request. */
  exists: Record<TaskStep, boolean>
  onShowStep: (step: TaskStep) => void
}

function markerClass(position: 'done' | 'current' | 'upcoming', move: TaskNextMove): string {
  if (position === 'done') return 'border-green-600 bg-green-600 text-white'
  if (position === 'upcoming') return 'border-[var(--gray-7)] bg-[var(--gray-1)]'
  if (move.kind === 'failed') return 'border-red-500 bg-red-500'
  if (move.kind === 'working') return 'border-blue-500 bg-blue-500 animate-pulse'
  return 'border-[var(--gray-12)] bg-[var(--gray-12)]'
}

/**
 * The task's artifacts as tabs: the plan and code, each with where it stands.
 * They're options, not stages: either can be asked for at any time, and
 * nothing waits on approval.
 */
export function TaskStepper({ currentStep, move, shownStep, exists, onShowStep }: TaskStepperProps) {
  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="Artifacts" className="flex flex-wrap gap-x-6 gap-y-2" onKeyDown={onTabListKeyDown}>
        {TASK_STEPS.map((step) => {
          const { position, label } = describeStep(step, currentStep, move, exists[step])
          const isShown = step === shownStep
          return (
            <button
              key={step}
              type="button"
              role="tab"
              id={stepTabId(step)}
              aria-controls={stepPanelId(step)}
              aria-selected={isShown}
              tabIndex={isShown ? 0 : -1}
              onClick={() => onShowStep(step)}
              className={clsx(
                'group flex items-start gap-2 border-b-2 pb-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-8)]',
                isShown ? 'border-[var(--accent-9)]' : 'border-transparent hover:border-[var(--gray-6)]'
              )}
            >
              <span aria-hidden className={clsx('mt-1 flex size-3.5 shrink-0 items-center justify-center rounded-full border', markerClass(position, move))}>
                {position === 'done' && <CheckIcon className="size-3" />}
              </span>
              <span className="leading-tight">
                <span className={clsx('block text-sm font-semibold', position === 'upcoming' ? 'text-[var(--gray-10)]' : 'text-[var(--gray-12)]')}>
                  {STEP_NAME[step]}
                </span>
                <span className={clsx('block text-xs', move.kind === 'failed' && position === 'current' ? 'text-red-700 dark:text-red-300' : 'text-[var(--gray-10)]')}>
                  {label}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
