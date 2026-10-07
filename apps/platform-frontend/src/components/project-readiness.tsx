import { Button } from '@/components/button'
import { getProjectReadiness } from '@/service/api/project-api'
import type { ProjectReadiness, ProjectReadinessCode } from '@viberglass/types'
import { CheckCircledIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'

/** What each setup fix's button says. */
const FIX_LABEL: Record<ProjectReadinessCode | 'fix', string> = {
  configure_repository: 'Choose repository',
  select_scm_credential: 'Select credential',
  replace_expired_scm_credential: 'Replace credential',
  start_agent_runner: 'Start agent',
  configure_agent_credentials: 'Add model key',
  fix: 'Fix',
}

/**
 * What's left before agents can work in a space. With `firstTaskHref` (the
 * space home), a ready space that hasn't run anything yet invites a first task
 * instead of the banner just disappearing (FR7).
 */
export function ProjectReadinessBanner({
  projectId,
  firstTaskHref,
  showDemoNotice = true,
}: {
  projectId: string
  firstTaskHref?: string
  /** Pages under the demo banner already say it's a demo space. */
  showDemoNotice?: boolean
}) {
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
  const warnings = readiness.checks.filter((check) => check.warning)
  if (readiness.automationAvailable && warnings.length > 0) {
    return (
      <section aria-label="Needs attention soon" className="rounded-xl border border-warning-300 bg-warning-50 p-4 text-sm dark:border-warning-900 dark:bg-warning-950/30">
        {warnings.map((check) => (
          <div key={check.key} className="flex flex-wrap items-center gap-3">
            <ExclamationTriangleIcon className="size-5 shrink-0 text-warning-700 dark:text-warning-400" />
            <p className="min-w-0 flex-1 text-warning-950 dark:text-warning-100">{check.warning}</p>
            {check.remediationUrl ? <Button href={check.remediationUrl}>Replace it</Button> : null}
          </div>
        ))}
      </section>
    )
  }
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
    if (!showDemoNotice) return null
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
    <section
      aria-label="Setup needed"
      className="grid gap-2 rounded-lg border border-warning-300 bg-warning-50 px-4 py-2.5 text-sm dark:border-warning-900 dark:bg-warning-950/30"
    >
      {incomplete.map((check) => (
        <div key={check.key} className="flex flex-wrap items-center gap-3">
          <ExclamationTriangleIcon className="size-4 shrink-0 text-warning-700 dark:text-warning-400" />
          <p className="min-w-0 flex-1 text-warning-950 dark:text-warning-100">{check.summary}</p>
          {check.remediationUrl ? (
            <Button href={check.remediationUrl} outline>
              {FIX_LABEL[check.code ?? 'fix']}
            </Button>
          ) : null}
        </div>
      ))}
    </section>
  )
}
