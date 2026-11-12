import clsx from 'clsx'

/** The 16:10 box every cover is drawn in. Covers repeat what the title says, so screen readers skip them. */
export function CoverFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div aria-hidden className={clsx('relative aspect-[16/10] overflow-hidden rounded-md shadow-[inset_0_0_0_1px_var(--gray-a3)]', className)}>
      {children}
    </div>
  )
}
