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

  return (
    <div
      role="note"
      aria-label="Demo instance"
      className={clsx(
        'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-1.5 text-xs text-[var(--gray-11)]',
        className
      )}
    >
      <span className="grow">This is a read-only demo of Viberglass. It resets every night.</span>
      <Link href={SOURCE_URL} target="_blank" rel="noreferrer" className={LINK}>
        Source on GitHub
      </Link>
      <Link href={INSTALL_GUIDE_URL} target="_blank" rel="noreferrer" className={LINK}>
        Install your own
      </Link>
    </div>
  )
}
