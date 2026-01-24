'use client'

import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Textarea } from '@/components/textarea'
import { useProject } from '@/context/project-context'
import { createTicket } from '@/service/api/ticket-api'
import type { CreateTicketRequest, Severity } from '@viberglass/types'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface CreateTicketClientProps {
  project: string
}

const severities = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'critical', name: 'Critical' },
]

export function CreateTicketClient({ project }: CreateTicketClientProps) {
  const [autoFixRequested, setAutoFixRequested] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
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
        severity: formData.get('severity') as Severity,
        category: formData.get('category') as string,
        autoFixRequested: autoFixRequested,
        ticketSystem: projectData.ticketSystem,
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

      const ticket = await createTicket(ticketData)
      router.push(`/project/${project}/tickets/${ticket.id}`)
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  return (
    <form className="mx-auto max-w-4xl" onSubmit={handleSubmit}>
      <Heading>Create New Ticket</Heading>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <Fieldset className="mt-8">
        <FieldGroup>
          <Field>
            <Label>Title</Label>
            <Description>A brief summary of the issue.</Description>
            <Input name="title" placeholder="e.g. Navigation bar overlaps content" required />
          </Field>

          <Field>
            <Label>Description</Label>
            <Description>Provide more details about the bug and how to reproduce it.</Description>
            <Textarea name="description" rows={5} placeholder="Steps to reproduce..." required />
          </Field>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <Field>
              <Label>Severity</Label>
              <Description>How critical is this issue?</Description>
              <Select name="severity" required defaultValue="medium">
                {severities.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <Label>Category</Label>
              <Description>What area of the project is affected?</Description>
              <Input name="category" placeholder="e.g. UI, Backend, API" required />
            </Field>
          </div>

          <SwitchField>
            <Label>Request Auto-fix</Label>
            <Description>Trigger the AI to attempt a fix for this issue immediately.</Description>
            <Switch name="auto_fix_requested" checked={autoFixRequested} onChange={setAutoFixRequested} />
          </SwitchField>

          <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
            <Button outline href={`/project/${project}/tickets`}>
              Cancel
            </Button>
            <Button type="submit" color="brand" disabled={isSubmitting || !projectData}>
              {isSubmitting ? 'Creating...' : 'Create Ticket'}
            </Button>
          </div>
        </FieldGroup>
      </Fieldset>
    </form>
  )
}
