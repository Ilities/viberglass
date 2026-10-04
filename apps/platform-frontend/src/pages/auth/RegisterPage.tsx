import { Logo } from '@/components/logo'
import { Button } from '@/components/button'
import { ErrorMessage, Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageMeta } from '@/components/page-meta'
import { Strong, Text, TextLink } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FieldErrors } from '@/lib/fieldErrors'
import { useEffect, useState } from 'react'

export function RegisterPage() {
  const { register, status } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  // Shown beside each field; what was typed stays, so only the wrong field needs changing.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirect = searchParams.get('redirect')

  useEffect(() => {
    if (status === 'authenticated') {
      const target = redirect && redirect.startsWith('/') ? redirect : '/'
      navigate(target, { replace: true })
    }
  }, [navigate, status, redirect])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setError(null)
    setFieldErrors({})
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = ((formData.get('email') as string) || '').trim()
    const name = ((formData.get('name') as string) || '').trim()
    const password = (formData.get('password') as string) || ''

    if (!email || !name || !password) {
      setError('Name, email, and password are required.')
      setIsSubmitting(false)
      return
    }

    try {
      await register(name, email, password)
      const target = redirect && redirect.startsWith('/') ? redirect : '/'
      navigate(target, { replace: true })
    } catch (err) {
      if (err instanceof FieldErrors) {
        setFieldErrors(err.fields)
        const first = Object.keys(err.fields)[0]
        form.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus()
      } else {
        setError(err instanceof Error ? err.message : 'Unable to create account.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="Create Account" />
      <form onSubmit={handleSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Create your account</Heading>
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      <Field>
        <Label>Email</Label>
        <Input type="email" name="email" autoComplete="email" required invalid={Boolean(fieldErrors.email)} />
        {fieldErrors.email && <ErrorMessage>{fieldErrors.email}</ErrorMessage>}
      </Field>
      <Field>
        <Label>Full name</Label>
        <Input name="name" autoComplete="name" required invalid={Boolean(fieldErrors.name)} />
        {fieldErrors.name && <ErrorMessage>{fieldErrors.name}</ErrorMessage>}
      </Field>
      <Field>
        <Label>Password</Label>
        <Input type="password" name="password" autoComplete="new-password" required invalid={Boolean(fieldErrors.password)} />
        {fieldErrors.password && <ErrorMessage>{fieldErrors.password}</ErrorMessage>}
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account...' : 'Create account'}
      </Button>
      <Text>
        Already have an account?{' '}
        <TextLink href="/login">
          <Strong>Sign in</Strong>
        </TextLink>
      </Text>
    </form>
    </>
  )
}
