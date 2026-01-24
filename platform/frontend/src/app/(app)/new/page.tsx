'use client'

import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Textarea } from '@/components/textarea'
import { createProject, type CreateProjectRequest } from '@/service/api/project-api'
import type { AuthCredentials } from '@viberglass/types'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const ticketSystems = [
  { id: 'jira', name: 'Jira' },
  { id: 'linear', name: 'Linear' },
  { id: 'github', name: 'GitHub Issues' },
  { id: 'gitlab', name: 'GitLab Issues' },
  { id: 'azure', name: 'Azure DevOps' },
  { id: 'asana', name: 'Asana' },
  { id: 'trello', name: 'Trello' },
  { id: 'monday', name: 'Monday.com' },
  { id: 'clickup', name: 'ClickUp' },
]

export default function NewProjectPage() {
  const [autoFixEnabled, setAutoFixEnabled] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

    try {
      const credentialsRaw = formData.get('credentials') as string
      let credentials: AuthCredentials = { type: 'api_key' }
      try {
        if (credentialsRaw) {
          const parsed = JSON.parse(credentialsRaw)
          credentials = {
            type: parsed.type || 'api_key',
            ...parsed,
          }
        }
      } catch (e) {
        throw new Error('Invalid JSON in Credentials field')
      }

      const projectData: CreateProjectRequest = {
        name: formData.get('name') as string,
        ticketSystem: formData.get('ticket_system') as CreateProjectRequest['ticketSystem'],
        credentials,
        repositoryUrl: formData.get('repository_url') as string,
        autoFixEnabled: autoFixEnabled,
        autoFixTags: ((formData.get('auto_fix_tags') as string) || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        customFieldMappings: {}, // Default empty for now
      }

      const project = await createProject(projectData)
      router.push(`/project/${project.slug}`)
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  return (
    <form className="mx-auto max-w-4xl" onSubmit={handleSubmit}>
      <Heading>Create New Project</Heading>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <Fieldset className="mt-8">
        <FieldGroup>
          <Field>
            <Label>Project Name</Label>
            <Description>What should we call this project?</Description>
            <Input name="name" placeholder="e.g. My Awesome App" required />
          </Field>

          <Field>
            <Label>Ticket System</Label>
            <Description>Which system do you use for tracking bugs?</Description>
            <Select name="ticket_system" required>
              <option value="">Select a system...</option>
              {ticketSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>Credentials (JSON)</Label>
            <Description>API keys and configuration for your ticket system.</Description>
            <Textarea
              name="credentials"
              className="font-mono"
              rows={5}
              placeholder={'{\n  "api_token": "...",\n  "project_key": "..."\n}'}
            />
          </Field>

          <Field>
            <Label>Repository URL</Label>
            <Description>The link to your project&apos;s source code.</Description>
            <Input name="repository_url" type="url" placeholder="https://github.com/org/repo" required />
          </Field>

          <SwitchField>
            <Label>Enable Auto-fix</Label>
            <Description>Allow AI to automatically suggest and create PRs for bug reports.</Description>
            <Switch name="auto_fix_enabled" checked={autoFixEnabled} onChange={setAutoFixEnabled} />
          </SwitchField>

          {autoFixEnabled && (
            <Field>
              <Label>Auto-fix Tags</Label>
              <Description>
                Comma-separated tags to trigger automatic fixes (e.g. &quot;bug, high-priority&quot;).
              </Description>
              <Input name="auto_fix_tags" placeholder="bug, fix-requested" />
            </Field>
          )}

          <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
            <Button outline href="/">
              Cancel
            </Button>
            <Button type="submit" color="brand" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </FieldGroup>
      </Fieldset>
    </form>
  )
}
