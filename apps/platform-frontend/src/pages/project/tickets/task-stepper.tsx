import { CheckIcon } from '@radix-ui/react-icons'
import clsx from 'clsx'
import { Fragment } from 'react'
import { describeStep, STEP_NAME, TASK_STEPS, type TaskNextMove, type TaskStep } from './task-next-move'

interface TaskStepperProps {
  currentStep: TaskStep
  move: TaskNextMove
  shownStep: TaskStep
  onShowStep: (step: TaskStep) => void
}

function markerClass(position: 'done' | 'current' | 'upcoming', move: TaskNextMove): string {
  if (position === 'done') return 'border-green-600 bg-green-600 text-white'
  if (position === 'upcoming') return 'border-[var(--gray-6)] bg-[var(--gray-1)] text-[var(--gray-9)]'
  if (move.kind === 'failed') return 'border-red-500 bg-red-500 text-white'
  if (move.kind === 'working') return 'border-blue-500 bg-blue-500 text-white animate-pulse'
  return 'border-[var(--gray-12)] bg-[var(--gray-12)] text-[var(--gray-1)]'
}

/** Research, Plan, Build: where the task is, and which step's work is on screen. */
export function TaskStepper({ currentStep, move, shownStep, onShowStep }: TaskStepperProps) {
  return (
    <div role="tablist" aria-label="Steps" className="flex items-stretch">
      {TASK_STEPS.map((step, index) => {
        const { position, label } = describeStep(step, currentStep, move)
        const isShown = step === shownStep
        return (
          <Fragment key={step}>
            {index > 0 && (
              <span aria-hidden className={clsx('mx-3 mt-[13px] h-px flex-1', position === 'upcoming' ? 'bg-[var(--gray-5)]' : 'bg-[var(--gray-8)]')} />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={isShown}
              onClick={() => onShowStep(step)}
              className={clsx(
                'group flex items-start gap-2.5 border-b-2 pb-3 text-left',
                isShown ? 'border-[var(--gray-12)]' : 'border-transparent hover:border-[var(--gray-6)]'
              )}
            >
              <span
                aria-hidden
                className={clsx('flex size-[26px] shrink-0 items-center justify-center rounded-full border text-xs font-semibold', markerClass(position, move))}
              >
                {position === 'done' ? <CheckIcon className="size-4" /> : index + 1}
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
          </Fragment>
        )
      })}
    </div>
  )
}
