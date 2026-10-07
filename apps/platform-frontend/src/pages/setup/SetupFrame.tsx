import { PageHeader } from '@/components/page-header'
import { Link as RadixLink } from '@radix-ui/themes'
import clsx from 'clsx'

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <RadixLink href={href} target="_blank" rel="noreferrer">
      {children}
    </RadixLink>
  )
}

export function SetupError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
      {message}
    </div>
  )
}

const STEPS = ['Model', 'Repository', 'Space', 'Agent', 'First task'] as const

/** One setup screen: the setup's steps with this one marked, and this step's form or progress in a panel. */
export function SetupFrame({
  step,
  title,
  intro,
  children,
}: {
  step: number
  title: string
  intro: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="w-full">
      <PageHeader
        eyebrow="Settings › Set up"
        title="Make your first agent ready"
        description="Connect a model, choose a repository, and name your space."
      />
      <ol aria-label="Setup steps" className="mb-7 flex flex-wrap gap-2 text-xs text-[var(--gray-10)]">
        {STEPS.map((name, index) => (
          <li
            key={name}
            aria-current={index + 1 === step ? 'step' : undefined}
            className={clsx(
              'rounded-md px-2.5 py-1.5',
              index + 1 === step && 'bg-amber-100 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100'
            )}
          >
            {index + 1} · {name}
          </li>
        ))}
      </ol>
      <section
        aria-labelledby="setup-step-title"
        className="rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)] p-7 max-sm:p-5"
      >
        <h2 id="setup-step-title" className="text-base font-semibold text-[var(--gray-12)]">
          {title}
        </h2>
        <p className="mt-1 mb-6 text-sm text-[var(--gray-10)]">{intro}</p>
        {children}
      </section>
    </div>
  )
}
