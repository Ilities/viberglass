import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { integrationLabel } from '@/integrations/integrationLabels'
import { getSetupNextSteps } from '@/service/api/setup-api'
import type { SetupNextSteps } from '@viberglass/types'
import { CheckCircledIcon, CircleIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'viberglass.nextStepsDismissed'

interface NextStep {
  key: string
  label: string
  href: string
  done: boolean
}

function nextSteps(steps: SetupNextSteps): NextStep[] {
  return [
    { key: 'team', label: 'Invite your team', href: '/settings/members', done: steps.teamInvited },
    ...(steps.chatSystem
      ? [
          {
            key: 'chat',
            label: `Connect ${integrationLabel(steps.chatSystem)}`,
            href: `/settings/connections/new/${steps.chatSystem}`,
            done: steps.chatConnected,
          },
        ]
      : []),
    { key: 'tracker', label: 'Connect your tracker', href: '/settings/connections', done: steps.trackerConnected },
  ]
}

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

  const items = steps ? nextSteps(steps) : []
  if (dismissed || !steps || items.every((item) => item.done)) return null

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
        </div>
        <Button plain onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            {item.done ? (
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
