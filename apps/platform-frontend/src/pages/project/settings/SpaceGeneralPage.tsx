import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageMeta } from '@/components/page-meta'
import { Switch, SwitchField } from '@/components/switch'
import { useProject } from '@/context/project-context'
import { getErrorMessage } from '@/lib/project-form'
import { updateProject } from '@/service/api/project-api'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SpaceHousekeeping } from './SpaceHousekeeping'

/** A space's name and who can see it, then archiving and deleting it. */
export function SpaceGeneralPage() {
  const navigate = useNavigate()
  const { project } = useProject()
  const [name, setName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!project) return
    setName(project.name)
    setIsPrivate(project.isPrivate)
  }, [project])

  if (!project) return null

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!project) return
    setError(null)
    setSuccess(null)
    if (!name.trim()) {
      setError('Give the space a name.')
      return
    }
    setIsSubmitting(true)
    try {
      const updated = await updateProject(project.id, { name: name.trim(), isPrivate })
      setName(updated.name)
      setIsPrivate(updated.isPrivate)
      setSuccess('Saved.')
      if (updated.slug !== project.slug) navigate(`/spaces/${updated.slug}/settings/general`, { replace: true })
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Failed to update space'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title={`${project.name} | Settings`} />
      <div className="max-w-4xl">
        <Heading>General</Heading>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {success}
          </div>
        )}

        <form className="mt-8" onSubmit={(event) => void handleSubmit(event)}>
          <Fieldset disabled={isSubmitting}>
            <FieldGroup className="space-y-8">
              <Field>
                <Label>Name</Label>
                <Input name="name" value={name} onChange={(event) => setName(event.target.value)} required />
              </Field>

              <SwitchField>
                <Label>Private space</Label>
                <Description>Only its members and workspace admins see it.</Description>
                <Switch aria-label="Private space" checked={isPrivate} onChange={setIsPrivate} />
              </SwitchField>

              <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
                <Button type="submit" color="brand" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </FieldGroup>
          </Fieldset>
        </form>

        <SpaceHousekeeping project={project} />
      </div>
    </>
  )
}
