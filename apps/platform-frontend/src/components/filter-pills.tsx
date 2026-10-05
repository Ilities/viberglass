import clsx from 'clsx'

/** A row of filters, one picked; the picked one is filled. */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="mb-4 flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'rounded-[7px] border px-3 py-2 text-sm transition-colors',
            option.value === value
              ? 'border-[var(--gray-12)] bg-[var(--gray-12)] text-[var(--gray-1)]'
              : 'border-[var(--gray-5)] bg-[var(--color-panel-solid)] text-[var(--gray-12)] hover:bg-[var(--gray-2)]'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
