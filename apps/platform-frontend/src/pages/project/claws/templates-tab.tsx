import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Textarea } from '@/components/textarea'
import { Timestamp } from '@/components/timestamp'
import type { Clanker } from '@/service/api/clanker-api'
import { getClankers } from '@/service/api/clanker-api'
import {
  createClawTaskTemplate,
  deleteClawTaskTemplate,
  getClawTaskTemplate,
  getClawTaskTemplates,
  updateClawTaskTemplate,
} from '@/service/api/claw-api'
import type { Secret } from '@/service/api/secret-api'
import { listAllSecrets } from '@/service/api/secret-api'
import { Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import type { ClawTaskTemplateSummary, SecretBinding } from '@viberglass/types'
import { describeBindingsProblem } from '@/pages/clankers/config/agentSecrets'
import { SecretBindingsField } from '@/pages/clankers/config/secret-bindings-field'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

type TemplateForm = {
  name: string
  description: string
  clankerId: string
  taskInstructions: string
  secretBindings: SecretBinding[]
}

const emptyForm: TemplateForm = { name: '', description: '', clankerId: '', taskInstructions: '', secretBindings: [] }

interface Props {
  projectId: string
  /** Opens the create dialog once the tab has loaded, when another tab sent someone here to make a template. */
  startCreating: boolean
  onStartedCreating: () => void
}

export function TemplatesTab({ projectId, startCreating, onStartedCreating }: Props) {
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
      const [t, c, s] = await Promise.all([getClawTaskTemplates(projectId), getClankers(100), listAllSecrets()])
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

  useEffect(() => {
    if (loading || !startCreating) return
    onStartedCreating()
    openCreate()
    // openCreate reads the agents just loaded; running it once per request is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, startCreating])

  const openEdit = async (t: ClawTaskTemplateSummary) => {
    setDialogMode('edit')
    setActiveTemplate(t)
    let taskInstructions = ''
    try {
      const full = await getClawTaskTemplate(t.id)
      taskInstructions = full.taskInstructions
    } catch { /* use empty default */ }
    setForm({
      name: t.name,
      description: t.description ?? '',
      clankerId: t.clankerId,
      taskInstructions,
      secretBindings: t.secretBindings,
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
      toast.error('Agent is required')
      return
    }
    if (dialogMode === 'create' && !form.taskInstructions.trim()) {
      toast.error('Task instructions are required')
      return
    }
    const bindingsProblem = describeBindingsProblem(form.secretBindings)
    if (bindingsProblem) {
      toast.error(bindingsProblem)
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
          secretBindings: form.secretBindings,
        })
        toast.success('Template created')
      } else if (activeTemplate) {
        const updates: Parameters<typeof updateClawTaskTemplate>[1] = {
          name: form.name.trim(),
          description: form.description.trim() || null,
          clankerId: form.clankerId,
          secretBindings: form.secretBindings,
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

  return (
    <>
      {templates.length > 0 && (
        <div className="flex justify-end">
          <Button color="brand" onClick={openCreate}>
            <PlusIcon />
            New template
          </Button>
        </div>
      )}

      {templates.length === 0 ? (
        <EmptyState
          title="No task templates yet"
          description="A template is the task a schedule runs."
          action={
            <Button color="brand" onClick={openCreate}>
              <PlusIcon />
              Create a template
            </Button>
          }
        />
      ) : (
        <Table className="mt-6">
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Agent</TableHeader>
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
                  {t.secretBindings.length > 0
                    ? t.secretBindings.map((binding) => binding.envVar).join(', ')
                    : '—'}
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
          <DialogTitle>{dialogMode === 'create' ? 'New task template' : 'Edit task template'}</DialogTitle>
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
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Checks service health and reports issues"
                  />
                </Field>
                <Field>
                  <Label>Agent</Label>
                  <Select
                    value={form.clankerId}
                    onChange={(v) => setForm((p) => ({ ...p, clankerId: v }))}
                    disabled={clankers.length === 0}
                    placeholder="No agents yet"
                  >
                    {clankers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Task instructions</Label>
                  <Textarea
                    value={form.taskInstructions}
                    onChange={(e) => setForm((p) => ({ ...p, taskInstructions: e.target.value }))}
                    placeholder="What the agent should do each time this runs…"
                    rows={6}
                  />
                </Field>
                <Field>
                  <Label>Credentials</Label>
                  <Description>Secrets the agent gets on top of its own.</Description>
                  <SecretBindingsField
                    secrets={secrets}
                    selectable={secrets.filter((secret) => !secret.purpose)}
                    bindings={form.secretBindings}
                    onChange={(secretBindings) => setForm((p) => ({ ...p, secretBindings }))}
                    agent={clankers.find((c) => c.id === form.clankerId)?.agent}
                    emptyMessage="No secrets configured. Add secrets in the Secrets section."
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
              {isSubmitting ? 'Saving...' : dialogMode === 'create' ? 'Create template' : 'Save changes'}
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
