import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { MultiSelect } from '@/components/multi-select'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Textarea } from '@/components/textarea'
import { Timestamp } from '@/components/timestamp'
import type { Clanker } from '@/service/api/clanker-api'
import { getClankers } from '@/service/api/clanker-api'
import {
  createClawTaskTemplate,
  deleteClawTaskTemplate,
  getClawTaskTemplates,
  updateClawTaskTemplate,
} from '@/service/api/claw-api'
import type { Secret } from '@/service/api/secret-api'
import { getSecrets } from '@/service/api/secret-api'
import { Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import type { ClawTaskTemplateSummary } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

type TemplateForm = {
  name: string
  description: string
  clankerId: string
  taskInstructions: string
  secretIds: string[]
}

const emptyForm: TemplateForm = { name: '', description: '', clankerId: '', taskInstructions: '', secretIds: [] }

interface Props {
  projectId: string
}

export function TemplatesTab({ projectId }: Props) {
  const [templates, setTemplates] = useState<ClawTaskTemplateSummary[]>([])
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [activeTemplate, setActiveTemplate] = useState<ClawTaskTemplateSummary | null>(null)
  const [form, setForm] = useState<TemplateForm>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ClawTaskTemplateSummary | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [t, c, s] = await Promise.all([getClawTaskTemplates(projectId), getClankers(100), getSecrets(100)])
      setTemplates(t)
      setClankers(c)
      setSecrets(s)
    } catch (err) {
      toast.error('Failed to load templates', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openCreate = () => {
    setDialogMode('create')
    setActiveTemplate(null)
    setForm({ ...emptyForm, clankerId: clankers[0]?.id ?? '' })
    setDialogOpen(true)
  }

  const openEdit = (t: ClawTaskTemplateSummary) => {
    setDialogMode('edit')
    setActiveTemplate(t)
    setForm({
      name: t.name,
      description: t.description ?? '',
      clankerId: t.clankerId,
      taskInstructions: '',
      secretIds: t.secretIds,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!form.clankerId) {
      toast.error('Clanker is required')
      return
    }
    if (dialogMode === 'create' && !form.taskInstructions.trim()) {
      toast.error('Task instructions are required')
      return
    }

    setIsSubmitting(true)
    try {
      if (dialogMode === 'create') {
        await createClawTaskTemplate({
          projectId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          clankerId: form.clankerId,
          taskInstructions: form.taskInstructions,
          secretIds: form.secretIds,
        })
        toast.success('Template created')
      } else if (activeTemplate) {
        const updates: Parameters<typeof updateClawTaskTemplate>[1] = {
          name: form.name.trim(),
          description: form.description.trim() || null,
          clankerId: form.clankerId,
          secretIds: form.secretIds,
        }
        if (form.taskInstructions.trim()) updates.taskInstructions = form.taskInstructions
        await updateClawTaskTemplate(activeTemplate.id, updates)
        toast.success('Template updated')
      }
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      toast.error('Failed to save template', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await deleteClawTaskTemplate(toDelete.id)
      toast.success('Template deleted')
      setTemplates((prev) => prev.filter((t) => t.id !== toDelete.id))
    } catch (err) {
      toast.error('Failed to delete template', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setDeleteOpen(false)
      setToDelete(null)
    }
  }

  const clankerName = (id: string) => {
    return clankers.find((c) => c.id === id)?.name ?? id.slice(0, 8)
  }

  if (loading) {
    return <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
  }

  const secretOptions = secrets.map((s) => ({ id: s.id, label: s.name, description: s.secretLocation }))

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Reusable task definitions that schedules run.</p>
        <Button color="brand" onClick={openCreate}>
          <PlusIcon />
          New Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">No task templates</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Create a template to define what a scheduled claw will do.
          </p>
          <Button color="brand" className="mt-6" onClick={openCreate}>
            <PlusIcon />
            Create Template
          </Button>
        </div>
      ) : (
        <Table className="mt-6">
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Clanker</TableHeader>
              <TableHeader>Credentials</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader>Updated</TableHeader>
              <TableHeader />
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium text-zinc-950 dark:text-white">{t.name}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{clankerName(t.clankerId)}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {t.secretIds.length > 0 ? `${t.secretIds.length} secret${t.secretIds.length > 1 ? 's' : ''}` : '—'}
                </TableCell>
                <TableCell className="max-w-xs truncate text-zinc-500 dark:text-zinc-400">
                  {t.description ?? '—'}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400"><Timestamp date={t.updatedAt} /></TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button plain onClick={() => openEdit(t)}>
                      <Pencil1Icon className="h-4 w-4" />
                    </Button>
                    <Button
                      surface
                      color="red"
                      onClick={() => {
                        setToDelete(t)
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
      )}

      <Dialog open={dialogOpen} onClose={() => !isSubmitting && setDialogOpen(false)} size="lg">
        <form onSubmit={handleSubmit}>
          <DialogTitle>{dialogMode === 'create' ? 'New Task Template' : 'Edit Template'}</DialogTitle>
          <DialogDescription>Define the task a scheduled claw will execute.</DialogDescription>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Daily health check"
                    required
                  />
                </Field>
                <Field>
                  <Label>Description</Label>
                  <Description>Optional. Shown in the templates list.</Description>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Checks service health and reports issues"
                  />
                </Field>
                <Field>
                  <Label>Clanker</Label>
                  <Select
                    value={form.clankerId}
                    onChange={(v) => setForm((p) => ({ ...p, clankerId: v }))}
                    disabled={clankers.length === 0}
                  >
                    {clankers.length === 0 ? (
                      <option value="">No clankers available</option>
                    ) : (
                      clankers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </Select>
                </Field>
                <Field>
                  <Label>Task instructions</Label>
                  {dialogMode === 'edit' && <Description>Leave blank to keep the existing instructions.</Description>}
                  <Textarea
                    value={form.taskInstructions}
                    onChange={(e) => setForm((p) => ({ ...p, taskInstructions: e.target.value }))}
                    placeholder="Describe what the clanker should do each time this task runs..."
                    rows={6}
                  />
                </Field>
                <MultiSelect
                  label="Credentials"
                  description="Secrets injected into the worker alongside the clanker's own credentials."
                  options={secretOptions}
                  value={form.secretIds}
                  onChange={(ids) => setForm((p) => ({ ...p, secretIds: ids }))}
                  emptyMessage="No secrets configured. Add secrets in the Secrets section."
                  searchable
                />
              </FieldGroup>
            </Fieldset>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button color="brand" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : dialogMode === 'create' ? 'Create Template' : 'Save Changes'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Alert open={deleteOpen} onClose={setDeleteOpen}>
        <AlertTitle>Delete template?</AlertTitle>
        <AlertDescription>
          Deleting <strong>{toDelete?.name}</strong> will also remove all schedules that use it. This cannot be undone.
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
