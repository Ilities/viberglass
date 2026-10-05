import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { getSetupNextSteps } from '@/service/api/setup-api'
import type { SetupNextSteps } from '@viberglass/types'
import { CheckCircledIcon, CircleIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'viberglass.nextStepsDismissed'

const ITEMS: Array<{ key: keyof SetupNextSteps; label: string; href: string }> = [
  { key: 'teamInvited', label: 'Invite your team', href: '/settings/members' },
  { key: 'slackConnected', label: 'Connect Slack', href: '/settings/connections/new/slack' },
  { key: 'trackerConnected', label: 'Connect your tracker', href: '/settings/connections' },
]

/** The admin's checklist after setup. Hidden once everything is done, or dismissed. */
export function NextStepsChecklist() {
  const [steps, setSteps] = useState<SetupNextSteps | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true')

  useEffect(() => {
    if (dismissed) return
    getSetupNextSteps()
      .then(setSteps)
      .catch(() => undefined)
  }, [dismissed])

  if (dismissed || !steps || ITEMS.every((item) => steps[item.key])) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  return (
    <section
      aria-label="Next steps"
      className="mt-6 rounded-lg border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Next steps</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Engineers can fine-tune agents and connections in Workspace settings → Advanced.
          </p>
        </div>
        <Button plain onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {ITEMS.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            {steps[item.key] ? (
              <>
                <CheckCircledIcon className="text-green-600" aria-hidden />
                <span className="text-zinc-500 line-through dark:text-zinc-400">{item.label}</span>
              </>
            ) : (
              <>
                <CircleIcon className="text-zinc-400" aria-hidden />
                <Link href={item.href} className="text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
                  {item.label}
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
