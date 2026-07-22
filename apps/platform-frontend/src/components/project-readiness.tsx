import { Button } from '@/components/button'
import { getProjectReadiness } from '@/service/api/project-api'
import type { ProjectReadiness } from '@viberglass/types'
import { CheckCircledIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'

export function ProjectReadinessBanner({ projectId }: { projectId: string }) {
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

  if (!readiness || readiness.automationAvailable) return null

  const incomplete = readiness.checks.filter((check) => check.state !== 'ready')
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">Automation needs setup</h2>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
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
