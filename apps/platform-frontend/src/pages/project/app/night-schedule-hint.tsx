import { Button } from '@/components/button'
import { createClawSchedule, getClawSchedules } from '@/service/api/claw-api'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const OFF_AT = 22
const ON_AT = 7

function dismissedKey(projectId: string): string {
  return `viberglass.nightScheduleHint.${projectId}`
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

const hour = (value: number) => `${String(value).padStart(2, '0')}:00`

/** Suggests turning the app off at night, for maintainers whose app has no schedule doing so yet. */
export function NightScheduleHint({ projectId }: { projectId: string }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissedKey(projectId)) !== null)
  const [needed, setNeeded] = useState(false)
  const [adding, setAdding] = useState(false)
  const timeZone = browserTimeZone()

  useEffect(() => {
    if (dismissed) return
    getClawSchedules(projectId)
      .then((schedules) => setNeeded(!schedules.some((schedule) => schedule.action === 'app_stop')))
      .catch(() => setNeeded(false))
  }, [projectId, dismissed])

  if (dismissed || !needed) return null

  const dismiss = () => {
    localStorage.setItem(dismissedKey(projectId), new Date().toISOString())
    setDismissed(true)
  }

  const add = async () => {
    setAdding(true)
    try {
      const nightly = { projectId, scheduleType: 'cron' as const, timezone: timeZone, isActive: true }
      await createClawSchedule({
        ...nightly,
        action: 'app_stop',
        name: 'Turn the app off at night',
        cronExpression: `0 0 ${OFF_AT} * * *`,
      })
      await createClawSchedule({
        ...nightly,
        action: 'app_start',
        name: 'Turn the app on in the morning',
        cronExpression: `0 0 ${ON_AT} * * *`,
      })
      toast.success('The app turns off at night from now on')
      setNeeded(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add the schedules")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--gray-3)] px-4 py-3 text-sm text-[var(--gray-11)]"
    >
      <p>
        Turn the app off at night? It would be off from {hour(OFF_AT)} to {hour(ON_AT)} ({timeZone}), and nobody can
        open it then. You can change the times under Schedules.
      </p>
      <div className="flex gap-2">
        <Button outline onClick={dismiss} disabled={adding}>
          Not now
        </Button>
        <Button color="brand" onClick={() => void add()} disabled={adding}>
          Add the schedules
        </Button>
      </div>
    </div>
  )
}
