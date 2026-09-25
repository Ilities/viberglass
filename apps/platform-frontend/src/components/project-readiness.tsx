import { Button } from '@/components/button'
import { getProjectReadiness } from '@/service/api/project-api'
import type { ProjectReadiness } from '@viberglass/types'
import { CheckCircledIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'

/**
 * What's left before agents can work in a space. With `firstTaskHref` (the
 * space home), a ready space that hasn't run anything yet invites a first task
 * instead of the banner just disappearing (FR7).
 */
export function ProjectReadinessBanner({ projectId, firstTaskHref }: { projectId: string; firstTaskHref?: string }) {
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null)

  useEffect(() => {
    let active = true
    getProjectReadiness(projectId)
      .then((value) => {
        if (active) setReadiness(value)
      })
      .catch(() => {
        if (active) setReadiness(null)
      })
    return () => {
      active = false
    }
  }, [projectId])

  if (!readiness) return null
  if (readiness.automationAvailable) {
    if (!firstTaskHref || readiness.hasRuns) return null
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
        <CheckCircledIcon className="size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-emerald-950 dark:text-emerald-100">Ready: try your first task</h2>
          <p className="mt-0.5 text-emerald-900/80 dark:text-emerald-200/80">
            Everything is set up. Ask for something small and review what the agent finds.
          </p>
        </div>
        <Button href={firstTaskHref}>Create a task</Button>
      </section>
    )
  }

  const demo = readiness.checks.find((check) => check.key === 'demo')
  if (demo) {
    return (
      <section className="rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 text-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="font-semibold text-zinc-950 dark:text-white">{demo.label}</h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-300">{demo.summary}</p>
        {demo.remediationUrl ? (
          <Button href={demo.remediationUrl} plain className="mt-1 px-0 text-xs">
            Set up your own
          </Button>
        ) : null}
      </section>
    )
  }

  const incomplete = readiness.checks.filter((check) => check.state !== 'ready')
  return (
    <section className="rounded-xl border border-warning-300 bg-warning-50 p-4 dark:border-warning-900 dark:bg-warning-950/30">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-warning-700 dark:text-warning-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-warning-950 dark:text-warning-100">Automation needs setup</h2>
          <p className="mt-1 text-sm text-warning-900/80 dark:text-warning-200/80">
            You can submit tickets now. Complete these items before starting research or execution.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
    {incomplete.map((check: ProjectReadiness['checks'][number]) => (
              <div key={check.key} className="rounded-lg bg-white/70 p-3 dark:bg-black/20">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white">
                  {check.state === 'ready' ? <CheckCircledIcon /> : <ExclamationTriangleIcon />}
                  {check.label}
                </div>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{check.summary}</p>
                {check.remediationUrl ? (
                  <Button href={check.remediationUrl} plain className="mt-1 px-0 text-xs">Fix setup</Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
