import { Link } from '@/components/link'
import { useDemoInstance } from '@/context/demo-instance-context'
import { SOURCE_URL } from '@/lib'
import clsx from 'clsx'

const INSTALL_GUIDE_URL = `${SOURCE_URL}/blob/main/docs/guide/admin/install-docker.md`

const LINK = 'text-[var(--accent-11)] underline underline-offset-2'

/** On a public demo instance, on every page: what it is and where to get your own. */
export function DemoInstanceBanner({ className }: { className?: string }) {
  const demo = useDemoInstance()
  if (!demo) return null

  // On a phone it's one short line; the full sentence and the install guide fit on wider screens.
  return (
    <div
      role="note"
      aria-label="Demo instance"
      className={clsx(
        'flex items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-1 text-xs text-[var(--gray-11)] sm:flex-wrap sm:py-1.5',
        className
      )}
    >
      <span className="min-w-0 grow truncate sm:hidden">Read-only demo, resets nightly</span>
      <span className="grow max-sm:hidden">This is a read-only demo of Viberglass. It resets every night.</span>
      <Link href={SOURCE_URL} target="_blank" rel="noreferrer" aria-label="Source on GitHub" className={clsx(LINK, 'shrink-0')}>
        <span className="sm:hidden">GitHub</span>
        <span className="max-sm:hidden">Source on GitHub</span>
      </Link>
      <Link href={INSTALL_GUIDE_URL} target="_blank" rel="noreferrer" className={clsx(LINK, 'max-sm:hidden')}>
        Install your own
      </Link>
    </div>
  )
}
