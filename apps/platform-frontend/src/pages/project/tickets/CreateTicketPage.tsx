import { Button } from '@/components/button'
import { Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageMeta } from '@/components/page-meta'
import { ProjectReadinessBanner } from '@/components/project-readiness'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { useProject } from '@/context/project-context'
import { createTicket } from '@/service/api/ticket-api'
import type { CreateTicketRequest, Severity } from '@viberglass/types'
import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { OwnerField } from './owner-field'
import { TaskAttachmentsField, type TaskAttachments } from './task-attachments-field'

const severities = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'critical', name: 'Critical' },
]

export function CreateTicketPage() {
  const { project } = useParams<{ project: string }>()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<TaskAttachments>({ screenshot: null, recording: null })
  const { project: projectData } = useProject()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectData) return

    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

    try {
      const ticketData: CreateTicketRequest = {
        projectId: projectData.id,
        title: formData.get('title') as string,
        description: formData.get('description') as string,
        severity: (formData.get('severity') as Severity | null) ?? 'medium',
        category: (formData.get('category') as string)?.trim() || 'General',
        autoFixRequested: false,
        ticketSystem: projectData.ticketSystem,
        ownerId: (formData.get('ownerId') as string | null) || undefined,
        metadata: {
          browser: { name: 'Manual Entry', version: '1.0' },
          os: { name: 'Manual Entry', version: '1.0' },
          console: [],
          errors: [],
          pageUrl: window.location.href,
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        annotations: [],
      }

      const ticket = await createTicket(ticketData, attachments.screenshot ?? undefined, attachments.recording ?? undefined)
      navigate(`/spaces/${project}/tasks/${ticket.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title={project ? `${project} | New task` : 'New task'} />
      <form className="mx-auto max-w-4xl" onSubmit={handleSubmit}>
      <Heading>Create task</Heading>

      {projectData ? <div className="mt-6"><ProjectReadinessBanner projectId={projectData.id} /></div> : null}

      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Once the task is created, choose Write the plan to have an agent read the codebase and write what it found and what it would change.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <Fieldset className="mt-8">
        <FieldGroup>
          <Field>
            <Label>Title</Label>
            <Input name="title" placeholder="e.g. Let customers save their cart" required />
          </Field>

          <Field>
            <Label>Description</Label>
            <Textarea name="description" rows={5} placeholder="What you want done or answered, and anything that helps" required />
          </Field>

          <details className="rounded-xl border border-zinc-950/10 p-4 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-medium text-zinc-900 dark:text-white">
              Optional details
            </summary>
            <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Severity</Label>
                <Select name="severity" defaultValue="medium">
                  {severities.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Category</Label>
                <Input name="category" placeholder="General" />
              </Field>
              {projectData && <OwnerField defaultOwnerId={projectData.defaultOwnerId ?? null} />}
              <TaskAttachmentsField value={attachments} onChange={setAttachments} />
            </div>
          </details>

          <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
            <Button outline href={`/spaces/${project}`}>
              Cancel
            </Button>
            <Button type="submit" color="brand" disabled={isSubmitting || !projectData}>
              {isSubmitting ? 'Creating…' : 'Create task'}
            </Button>
          </div>
        </FieldGroup>
      </Fieldset>
    </form>
    </>
  )
}
