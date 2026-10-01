import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Logo } from '@/components/logo'
import { PageMeta } from '@/components/page-meta'
import { Strong, Text, TextLink } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/roleCopy'
import { acceptInvite, getInvitePreview, type InvitePreview } from '@/service/api/account-link-api'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export function AcceptInvitePage() {
  const { token = '' } = useParams<{ token: string }>()
  const { adoptSession } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    getInvitePreview(token)
      .then(setInvite)
      .catch((err: unknown) => setLinkError(err instanceof Error ? err.message : 'This invite link is not valid.'))
  }, [token])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    if (password.length < 8) {
      setError('Use at least 8 characters for the password.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      adoptSession(await acceptInvite(token, name, password))
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept the invite')
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="Join Viberglass" noIndex />
      <div className="grid w-full max-w-sm grid-cols-1 gap-8">
        <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
        {linkError ? (
          <>
            <Heading>This link doesn’t work any more</Heading>
            <Text>{linkError}</Text>
            <Text>
              Already have an account?{' '}
              <TextLink href="/login">
                <Strong>Sign in</Strong>
              </TextLink>
            </Text>
          </>
        ) : !invite ? (
          <Text>Checking your invite…</Text>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8">
            <div>
              <Heading>Join Viberglass</Heading>
              <Text className="mt-2">
                {invite.invitedByName ? `${invite.invitedByName} invited you` : 'You were invited'} as{' '}
                <Strong>{ROLE_LABEL[invite.role]}</Strong>: {ROLE_DESCRIPTION[invite.role]}
              </Text>
            </div>
            {error && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
            <Field>
              <Label>Email</Label>
              <Input type="email" value={invite.email} readOnly />
            </Field>
            <Field>
              <Label>Your name</Label>
              <Input name="name" autoComplete="name" required autoFocus />
            </Field>
            <Field>
              <Label>Password</Label>
              <Input type="password" name="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Joining…' : 'Join'}
            </Button>
          </form>
        )}
      </div>
    </>
  )
}
