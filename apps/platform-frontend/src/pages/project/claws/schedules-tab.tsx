import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Textarea } from '@/components/textarea'
import { Timestamp } from '@/components/timestamp'
import { getAppBackups } from '@/service/api/app-api'
import {
  createClawSchedule,
  deleteClawSchedule,
  getClawSchedules,
  getClawTaskTemplate,
  getClawTaskTemplates,
  pauseClawSchedule,
  resumeClawSchedule,
  updateClawSchedule,
} from '@/service/api/claw-api'
import { PauseIcon, Pencil1Icon, PlayIcon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import {
  isAppScheduleAction,
  parseIntervalExpression,
  type AppDataBackup,
  type ClawScheduleAction,
  type ClawScheduleSummary,
  type ClawTaskTemplateSummary,
} from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CronScheduleField } from './cron-schedule-field'
import { buildCron, defaultCronBuilder, describeCron, parseCronBuilder, type CronBuilder } from './cronSchedule'
import { backupLabel, RestoreBackupField } from './restore-backup-field'

type IntervalUnit = 'minutes' | 'hours' | 'days' | 'weeks'
const UNIT_SUFFIX: Record<IntervalUnit, string> = { minutes: 'm', hours: 'h', days: 'd', weeks: 'w' }

type ScheduleForm = {
  name: string
  description: string
  action: ClawScheduleAction
  taskTemplateId: string
  taskInstructions: string
  backupId: string
  scheduleType: 'interval' | 'cron'
  intervalValue: string
  intervalUnit: IntervalUnit
  cron: CronBuilder
  timezone: string
}

const emptyForm: ScheduleForm = {
  name: '',
  description: '',
  action: 'run_template',
  taskTemplateId: '',
  taskInstructions: '',
  backupId: '',
  scheduleType: 'interval',
  intervalValue: '1',
  intervalUnit: 'hours',
  cron: defaultCronBuilder,
  timezone: 'UTC',
}

function formatExpression(s: ClawScheduleSummary): string {
  if (s.scheduleType === 'interval' && s.intervalExpression) {
    const parsed = parseIntervalExpression(s.intervalExpression)
    if (parsed) {
      const singular: Record<string, string> = { minutes: 'minute', hours: 'hour', days: 'day', weeks: 'week' }
      return parsed.value === 1 ? `Every ${singular[parsed.unit]}` : `Every ${parsed.value} ${parsed.unit}`
    }
    return s.intervalExpression
  }
  if (s.scheduleType === 'cron' && s.cronExpression) {
    const description = describeCron(s.cronExpression)
    return description ? `${description} (${s.timezone})` : s.cronExpression
  }
  return '—'
}

const ACTION_LABELS: Record<ClawScheduleAction, string> = {
  run_template: 'Run a task template',
  app_start: 'Turn the app on',
  app_stop: 'Turn the app off',
  app_restore_data: 'Restore app data',
}

interface Props {
  projectId: string
  /** Schedules run task templates, so with none yet this is where to make one. */
  onCreateTemplate: () => void
  /** An App space's maintainers also schedule when its app is on. */
  appActions?: boolean
  /** Viewers see the schedules without the buttons to change them. */
  readOnly?: boolean
}

export function SchedulesTab({ projectId, onCreateTemplate, appActions = false, readOnly = false }: Props) {
  const [schedules, setSchedules] = useState<ClawScheduleSummary[]>([])
  const [templates, setTemplates] = useState<ClawTaskTemplateSummary[]>([])
  const [backups, setBackups] = useState<AppDataBackup[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [activeSchedule, setActiveSchedule] = useState<ClawScheduleSummary | null>(null)
  const [form, setForm] = useState<ScheduleForm>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ClawScheduleSummary | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [s, t] = await Promise.all([getClawSchedules(projectId), getClawTaskTemplates(projectId)])
      setSchedules(s)
      setTemplates(t)
      if (appActions || s.some((schedule) => schedule.action === 'app_restore_data')) {
        setBackups(await getAppBackups(projectId).catch(() => []))
      }
    } catch (err) {
      toast.error('Failed to load schedules', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [projectId, appActions])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openCreate = async () => {
    setDialogMode('create')
    setActiveSchedule(null)
    const firstTemplateId = templates[0]?.id ?? ''
    let taskInstructions = ''
    if (firstTemplateId) {
      try {
        const tmpl = await getClawTaskTemplate(firstTemplateId)
        taskInstructions = tmpl.taskInstructions
      } catch {
        /* use empty default */
      }
    }
    const action = firstTemplateId || !appActions ? 'run_template' : 'app_stop'
    setForm({ ...emptyForm, action, taskTemplateId: firstTemplateId, taskInstructions, backupId: backups[0]?.id ?? '' })
    setDialogOpen(true)
  }

  const openEdit = async (s: ClawScheduleSummary) => {
    setDialogMode('edit')
    setActiveSchedule(s)
    let intervalValue = '1'
    let intervalUnit: IntervalUnit = 'hours'
    if (s.scheduleType === 'interval' && s.intervalExpression) {
      const parsed = parseIntervalExpression(s.intervalExpression)
      if (parsed) {
        intervalValue = String(parsed.value)
        intervalUnit = parsed.unit
      }
    }
    let taskInstructions = ''
    if (s.taskTemplateId) {
      try {
        const tmpl = await getClawTaskTemplate(s.taskTemplateId)
        taskInstructions = tmpl.taskInstructions
      } catch {
        /* use empty default */
      }
    }
    setForm({
      name: s.name,
      description: s.description ?? '',
      action: s.action,
      taskTemplateId: s.taskTemplateId ?? '',
      taskInstructions,
      backupId: s.backupId ?? '',
      scheduleType: s.scheduleType,
      intervalValue,
      intervalUnit,
      cron: parseCronBuilder(s.cronExpression ?? ''),
      timezone: s.timezone,
    })
    setDialogOpen(true)
  }

  const handleTemplateChange = async (templateId: string) => {
    setForm((p) => ({ ...p, taskTemplateId: templateId }))
    try {
      const tmpl = await getClawTaskTemplate(templateId)
      setForm((p) => ({ ...p, taskInstructions: tmpl.taskInstructions }))
    } catch {
      /* keep current instructions */
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    const runsTemplate = form.action === 'run_template'
    if (runsTemplate && !form.taskTemplateId) {
      toast.error('Task template is required')
      return
    }
    const restoresData = form.action === 'app_restore_data'
    if (restoresData && !form.backupId) {
      toast.error('Pick a backup to restore')
      return
    }
    const isInterval = form.scheduleType === 'interval'
    if (!isInterval && !describeCron(buildCron(form.cron))) {
      toast.error('Enter a valid cron expression')
      return
    }

    const intervalExpression = isInterval ? `${form.intervalValue}${UNIT_SUFFIX[form.intervalUnit]}` : undefined
    const cronExpression = !isInterval ? buildCron(form.cron) : undefined
    setIsSubmitting(true)
    try {
      if (dialogMode === 'create') {
        await createClawSchedule({
          projectId,
          action: form.action,
          ...(runsTemplate ? { taskTemplateId: form.taskTemplateId } : {}),
          ...(restoresData ? { backupId: form.backupId } : {}),
          name: form.name.trim(),
          description: form.description.trim() || null,
          scheduleType: form.scheduleType,
          intervalExpression,
          cronExpression,
          timezone: form.timezone || 'UTC',
          isActive: true,
        })
        toast.success('Schedule created')
      } else if (activeSchedule) {
        await updateClawSchedule(activeSchedule.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          scheduleType: form.scheduleType,
          intervalExpression,
          cronExpression,
          timezone: form.timezone || 'UTC',
        })
        toast.success('Schedule updated')
      }
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      toast.error('Failed to save schedule', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleActive = async (s: ClawScheduleSummary) => {
    try {
      if (s.isActive) {
        await pauseClawSchedule(s.id)
        toast.success('Schedule paused')
      } else {
        await resumeClawSchedule(s.id)
        toast.success('Schedule resumed')
      }
      setSchedules((prev) => prev.map((item) => (item.id === s.id ? { ...item, isActive: !item.isActive } : item)))
    } catch (err) {
      toast.error('Failed to update schedule', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await deleteClawSchedule(toDelete.id)
      toast.success('Schedule deleted')
      setSchedules((prev) => prev.filter((s) => s.id !== toDelete.id))
    } catch (err) {
      toast.error('Failed to delete schedule', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setDeleteOpen(false)
      setToDelete(null)
    }
  }

  const whatItDoes = (s: ClawScheduleSummary) => {
    const backup = s.backupId ? backups.find((b) => b.id === s.backupId) : undefined
    if (backup) return `${ACTION_LABELS[s.action]} from ${backupLabel(backup)}`
    if (!s.taskTemplateId) return ACTION_LABELS[s.action]
    return templates.find((t) => t.id === s.taskTemplateId)?.name ?? s.taskTemplateId.slice(0, 8)
  }
  // Only maintainers may change when the app is on.
  const canChange = (s: ClawScheduleSummary) => !readOnly && (appActions || !isAppScheduleAction(s.action))

  if (loading) return <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Loading...</div>

  return (
    <>
      {readOnly ? null : templates.length === 0 && !appActions ? (
        <EmptyState
          title="No task templates yet"
          description="A schedule runs a task template."
          action={
            <Button color="brand" onClick={onCreateTemplate}>
              <PlusIcon />
              Create a template
            </Button>
          }
        />
      ) : (
        <div className="flex justify-end">
          <Button color="brand" onClick={openCreate}>
            <PlusIcon />
            New schedule
          </Button>
        </div>
      )}

      {schedules.length > 0 ? (
        <Table className="mt-6">
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Does</TableHeader>
              <TableHeader>Schedule</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Last run</TableHeader>
              <TableHeader>Runs / fails</TableHeader>
              <TableHeader />
            </TableRow>
          </TableHead>
          <TableBody>
            {schedules.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="min-w-40 font-medium whitespace-normal text-zinc-950 dark:text-white">
                  {s.name}
                </TableCell>
                <TableCell className="min-w-48 whitespace-normal text-zinc-500 dark:text-zinc-400">
                  {whatItDoes(s)}
                </TableCell>
                <TableCell
                  className="min-w-48 whitespace-normal text-zinc-500 dark:text-zinc-400"
                  title={s.scheduleType === 'cron' ? (s.cronExpression ?? undefined) : undefined}
                >
                  {formatExpression(s)}
                </TableCell>
                <TableCell>
                  <Badge color={s.isActive ? 'green' : 'zinc'}>{s.isActive ? 'Active' : 'Paused'}</Badge>
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {s.lastRunAt ? <Timestamp date={s.lastRunAt} /> : '—'}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {s.runCount} / {s.failureCount}
                </TableCell>
                <TableCell>
                  {canChange(s) && (
                    <div className="flex items-center justify-end gap-2">
                      <Button plain aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}>
                        <Pencil1Icon className="h-4 w-4" />
                      </Button>
                      <Button
                        plain
                        onClick={() => toggleActive(s)}
                        aria-label={`${s.isActive ? 'Pause' : 'Resume'} ${s.name}`}
                        title={s.isActive ? 'Pause' : 'Resume'}
                      >
                        {s.isActive ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                      </Button>
                      <Button
                        surface
                        color="red"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => {
                          setToDelete(s)
                          setDeleteOpen(true)
                        }}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : readOnly || templates.length > 0 || appActions ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">No schedules yet.</p>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onClose={() => !isSubmitting && setDialogOpen(false)} size="lg">
        <form onSubmit={handleSubmit}>
          <DialogTitle>{dialogMode === 'create' ? 'New schedule' : 'Edit schedule'}</DialogTitle>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Nightly health check"
                    required
                  />
                </Field>
                <Field>
                  <Label>Description</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Optional description"
                  />
                </Field>
                {appActions && (
                  <Field>
                    <Label>What it does</Label>
                    <Select
                      value={form.action}
                      onChange={(v) => setForm((p) => ({ ...p, action: v as ClawScheduleAction }))}
                      disabled={dialogMode === 'edit'}
                    >
                      {(templates.length > 0 || form.action === 'run_template'
                        ? (['run_template', 'app_start', 'app_stop', 'app_restore_data'] as const)
                        : (['app_start', 'app_stop', 'app_restore_data'] as const)
                      ).map((action) => (
                        <option key={action} value={action}>
                          {ACTION_LABELS[action]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {form.action === 'run_template' && (
                  <>
                    <Field>
                      <Label>Task template</Label>
                      <Select
                        value={form.taskTemplateId}
                        onChange={handleTemplateChange}
                        disabled={dialogMode === 'edit'}
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label>Task instructions</Label>
                      <Textarea readOnly value={form.taskInstructions} rows={6} />
                    </Field>
                  </>
                )}
                {form.action === 'app_restore_data' && (
                  <RestoreBackupField
                    backups={backups}
                    value={form.backupId}
                    onChange={(backupId) => setForm((p) => ({ ...p, backupId }))}
                    disabled={dialogMode === 'edit'}
                  />
                )}
                <Field>
                  <Label>Schedule type</Label>
                  <Select
                    value={form.scheduleType}
                    onChange={(v) => setForm((p) => ({ ...p, scheduleType: v as 'interval' | 'cron' }))}
                  >
                    <option value="interval">Interval</option>
                    <option value="cron">At set times</option>
                  </Select>
                </Field>
                {form.scheduleType === 'interval' ? (
                  <Field>
                    <Label>Interval</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={form.intervalValue}
                        onChange={(e) => setForm((p) => ({ ...p, intervalValue: e.target.value }))}
                        className="w-24"
                      />
                      <Select
                        value={form.intervalUnit}
                        onChange={(v) => setForm((p) => ({ ...p, intervalUnit: v as IntervalUnit }))}
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                      </Select>
                    </div>
                  </Field>
                ) : (
                  <CronScheduleField
                    value={form.cron}
                    onChange={(cron) => setForm((p) => ({ ...p, cron }))}
                    timezone={form.timezone}
                  />
                )}
                <Field>
                  <Label>Timezone</Label>
                  <Input
                    value={form.timezone}
                    onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                    placeholder="UTC"
                  />
                </Field>
              </FieldGroup>
            </Fieldset>
          </DialogBody>
          <DialogActions>
            <Button outline onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button color="brand" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : dialogMode === 'create' ? 'Create schedule' : 'Save changes'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Alert open={deleteOpen} onClose={setDeleteOpen}>
        <AlertTitle>Delete schedule?</AlertTitle>
        <AlertDescription>
          Deleting <strong>{toDelete?.name}</strong> will stop all future runs. This cannot be undone.
        </AlertDescription>
        <AlertActions>
          <Button outline onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDelete}>
            Delete
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}
