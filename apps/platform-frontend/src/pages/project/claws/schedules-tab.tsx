import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import {
  createClawSchedule,
  deleteClawSchedule,
  getClawSchedules,
  getClawTaskTemplates,
  pauseClawSchedule,
  resumeClawSchedule,
  updateClawSchedule,
} from '@/service/api/claw-api'
import { PauseIcon, Pencil1Icon, PlayIcon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { parseIntervalExpression, type ClawScheduleSummary, type ClawTaskTemplateSummary } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

type IntervalUnit = 'minutes' | 'hours' | 'days' | 'weeks'
const UNIT_SUFFIX: Record<IntervalUnit, string> = { minutes: 'm', hours: 'h', days: 'd', weeks: 'w' }

type ScheduleForm = {
  name: string
  description: string
  taskTemplateId: string
  scheduleType: 'interval' | 'cron'
  intervalValue: string
  intervalUnit: IntervalUnit
  cronExpression: string
  timezone: string
}

const emptyForm: ScheduleForm = {
  name: '',
  description: '',
  taskTemplateId: '',
  scheduleType: 'interval',
  intervalValue: '1',
  intervalUnit: 'hours',
  cronExpression: '',
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
  if (s.scheduleType === 'cron' && s.cronExpression) return s.cronExpression
  return '—'
}

interface Props {
  projectId: string
}

export function SchedulesTab({ projectId }: Props) {
  const [schedules, setSchedules] = useState<ClawScheduleSummary[]>([])
  const [templates, setTemplates] = useState<ClawTaskTemplateSummary[]>([])
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
    } catch (err) {
      toast.error('Failed to load schedules', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openCreate = () => {
    setDialogMode('create')
    setActiveSchedule(null)
    setForm({ ...emptyForm, taskTemplateId: templates[0]?.id ?? '' })
    setDialogOpen(true)
  }

  const openEdit = (s: ClawScheduleSummary) => {
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
    setForm({
      name: s.name,
      description: s.description ?? '',
      taskTemplateId: s.taskTemplateId,
      scheduleType: s.scheduleType,
      intervalValue,
      intervalUnit,
      cronExpression: s.cronExpression ?? '',
      timezone: s.timezone,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!form.taskTemplateId) {
      toast.error('Task template is required')
      return
    }
    if (form.scheduleType === 'cron' && !form.cronExpression.trim()) {
      toast.error('Cron expression is required')
      return
    }

    const isInterval = form.scheduleType === 'interval'
    const intervalExpression = isInterval ? `${form.intervalValue}${UNIT_SUFFIX[form.intervalUnit]}` : undefined
    const cronExpression = !isInterval ? form.cronExpression.trim() : undefined
    setIsSubmitting(true)
    try {
      if (dialogMode === 'create') {
        await createClawSchedule({
          projectId,
          taskTemplateId: form.taskTemplateId,
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

  const templateName = (id: string) => {
    return templates.find((t) => t.id === id)?.name ?? id.slice(0, 8)
  }

  if (loading) return <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Loading...</div>

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Schedules run task templates automatically on a set interval or cron expression.
        </p>
        <Button color="brand" onClick={openCreate} disabled={templates.length === 0}>
          <PlusIcon />
          New Schedule
        </Button>
      </div>
      {templates.length === 0 && (
        <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
          Create a task template first before adding schedules.
        </p>
      )}

      {schedules.length > 0 ? (
        <Table className="mt-6">
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Template</TableHeader>
              <TableHeader>Schedule</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Last run</TableHeader>
              <TableHeader>Runs / Fails</TableHeader>
              <TableHeader />
            </TableRow>
          </TableHead>
          <TableBody>
            {schedules.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium text-zinc-950 dark:text-white">{s.name}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{templateName(s.taskTemplateId)}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
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
                  <div className="flex items-center justify-end gap-2">
                    <Button plain onClick={() => openEdit(s)}>
                      <Pencil1Icon className="h-4 w-4" />
                    </Button>
                    <Button plain onClick={() => toggleActive(s)} title={s.isActive ? 'Pause' : 'Resume'}>
                      {s.isActive ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                    </Button>
                    <Button
                      surface
                      color="red"
                      onClick={() => {
                        setToDelete(s)
                        setDeleteOpen(true)
                      }}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : templates.length > 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">No schedules yet. Create one to get started.</p>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onClose={() => !isSubmitting && setDialogOpen(false)} size="lg">
        <form onSubmit={handleSubmit}>
          <DialogTitle>{dialogMode === 'create' ? 'New Schedule' : 'Edit Schedule'}</DialogTitle>
          <DialogDescription>Configure when and how often a task template runs.</DialogDescription>
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
                <Field>
                  <Label>Task template</Label>
                  <Select value={form.taskTemplateId} onChange={(v) => setForm((p) => ({ ...p, taskTemplateId: v }))}>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Schedule type</Label>
                  <Select
                    value={form.scheduleType}
                    onChange={(v) => setForm((p) => ({ ...p, scheduleType: v as 'interval' | 'cron' }))}
                  >
                    <option value="interval">Interval</option>
                    <option value="cron">Cron expression</option>
                  </Select>
                </Field>
                {form.scheduleType === 'interval' ? (
                  <Field>
                    <Label>Interval</Label>
                    <Description>How often should this schedule run?</Description>
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
                  <Field>
                    <Label>Cron expression</Label>
                    <Description>Standard 6-part cron: sec min hour day month dow</Description>
                    <Input
                      value={form.cronExpression}
                      onChange={(e) => setForm((p) => ({ ...p, cronExpression: e.target.value }))}
                      placeholder="0 0 * * * *"
                      className="font-mono"
                    />
                  </Field>
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
            <Button plain onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button color="brand" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : dialogMode === 'create' ? 'Create Schedule' : 'Save Changes'}
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
          <Button plain onClick={() => setDeleteOpen(false)}>
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
