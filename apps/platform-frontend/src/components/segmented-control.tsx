'use client'

import clsx from 'clsx'

interface SegmentedControlOption {
  value: string
  label: string
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <span data-slot="control" className={className}>
      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={clsx(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors',
              value === option.value
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </span>
  )
}
