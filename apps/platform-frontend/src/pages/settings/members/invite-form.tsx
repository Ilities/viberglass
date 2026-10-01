import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Subheading } from '@/components/heading'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/roleCopy'
import { createInvite, type Invite } from '@/service/api/invite-api'
import { isWorkspaceRole, WORKSPACE_ROLES, type Project, type WorkspaceRole } from '@viberglass/types'
import { useState, type FormEvent } from 'react'
import { CopyLink } from './copy-link'

export function InviteForm({ spaces, onInvited }: { spaces: Project[]; onInvited: (invite: Invite) => void }) {
  const [role, setRole] = useState<WorkspaceRole>('member')
  const [spaceIds, setSpaceIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; path: string; emailed: boolean } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const email = String(new FormData(form).get('email') ?? '').trim()
    if (role === 'guest' && spaceIds.length === 0) {
      setError('Pick at least one space: a guest sees only the spaces they’re invited to.')
      return
    }
    setError(null)
    setCreated(null)
    setIsSubmitting(true)
    try {
      const { invite, path, emailed } = await createInvite(email, role, spaceIds)
      setCreated({ email: invite.email, path, emailed })
      onInvited(invite)
      form.reset()
      setSpaceIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the invite')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Invite someone</Subheading>
      <form className="mt-5" onSubmit={handleSubmit}>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <Label>Email</Label>
            <Input name="email" type="email" autoComplete="off" required />
          </Field>
          <Field>
            <Label>Role</Label>
            <Select value={role} onChange={(value) => isWorkspaceRole(value) && setRole(value)}>
              {WORKSPACE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABEL[option]}
                </option>
              ))}
            </Select>
            <Description>{ROLE_DESCRIPTION[role]}</Description>
          </Field>
        </FieldGroup>
        {spaces.length > 0 && (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-zinc-950 dark:text-white">
              Spaces to join{role === 'guest' ? '' : ' (optional)'}
            </legend>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {role === 'guest'
                ? 'A guest sees only these spaces.'
                : 'They become a member of these spaces, which sets their defaults and notifications.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {spaces.map((space) => (
                <label key={space.id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={spaceIds.includes(space.id)}
                    onChange={(event) =>
                      setSpaceIds((current) =>
                        event.target.checked ? [...current, space.id] : current.filter((id) => id !== space.id)
                      )
                    }
                  />
                  {space.name}
                  {space.isPrivate && <span className="text-xs text-zinc-500">(private)</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating the link…' : 'Create invite link'}
          </Button>
        </div>
      </form>
      {created && (
        <div className="mt-5">
          <CopyLink
            path={created.path}
            note={
              created.emailed
                ? `Emailed to ${created.email}. You can also send this link yourself: it works once, for 7 days, and is shown only now.`
                : `Send this link to ${created.email}. It works once, for 7 days, and is shown only now. Email isn't set up, so Viberglass doesn't send it for you.`
            }
          />
        </div>
      )}
    </section>
  )
}
