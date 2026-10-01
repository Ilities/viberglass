import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Logo } from '@/components/logo'
import { PageMeta } from '@/components/page-meta'
import { Strong, Text, TextLink } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { getResetPreview, resetPassword, type ResetPreview } from '@/service/api/account-link-api'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export function ResetPasswordPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { adoptSession } = useAuth()
  const navigate = useNavigate()
  const [link, setLink] = useState<ResetPreview | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    getResetPreview(token)
      .then(setLink)
      .catch((err: unknown) => setLinkError(err instanceof Error ? err.message : 'This reset link is not valid.'))
  }, [token])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = String(new FormData(event.currentTarget).get('password') ?? '')
    if (password.length < 8) {
      setError('Use at least 8 characters for the password.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      adoptSession(await resetPassword(token, password))
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set the password')
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="Set a new password" noIndex />
      <div className="grid w-full max-w-sm grid-cols-1 gap-8">
        <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
        {linkError ? (
          <>
            <Heading>This link doesn’t work any more</Heading>
            <Text>{linkError}</Text>
            <Text>
              <TextLink href="/login">
                <Strong>Back to sign in</Strong>
              </TextLink>
            </Text>
          </>
        ) : !link ? (
          <Text>Checking your link…</Text>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8">
            <div>
              <Heading>Set a new password</Heading>
              <Text className="mt-2">
                For {link.name} ({link.email}). You’ll be signed out everywhere else.
              </Text>
            </div>
            {error && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
            <Field>
              <Label>New password</Label>
              <Input type="password" name="password" autoComplete="new-password" minLength={8} required autoFocus />
            </Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Set password and sign in'}
            </Button>
          </form>
        )}
      </div>
    </>
  )
}
