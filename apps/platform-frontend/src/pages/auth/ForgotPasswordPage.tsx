import { Logo } from '@/components/logo'
import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageMeta } from '@/components/page-meta'
import { Strong, Text, TextLink } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { requestPasswordReset } from '@/service/api/auth-api'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

export function ForgotPasswordPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ emailEnabled: boolean } | null>(null)

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/', { replace: true })
    }
  }, [navigate, status])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = ((formData.get('email') as string) || '').trim()

    if (!email) {
      setError('Email is required.')
      setIsSubmitting(false)
      return
    }

    try {
      setSubmitted(await requestPasswordReset(email))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request reset.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="Reset Password" />
      <form onSubmit={handleSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Reset your password</Heading>
      <Text>Enter your email and we will send you a link to reset your password.</Text>
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {submitted && !error && (
        submitted.emailEnabled ? (
          <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            If the email exists, a reset link is on the way.
          </div>
        ) : (
          <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            This installation doesn&apos;t send email. Ask an admin for a reset link: they can make one under Settings, Members.
          </div>
        )
      )}
      <Field>
        <Label>Email</Label>
        <Input type="email" name="email" autoComplete="email" required />
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Reset password'}
      </Button>
      <Text>
        Remembered it?{' '}
        <TextLink href="/login">
          <Strong>Sign in</Strong>
        </TextLink>
      </Text>
    </form>
    </>
  )
}
