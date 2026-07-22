import { Logo } from '@/components/logo'
import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageMeta } from '@/components/page-meta'
import { Strong, Text, TextLink } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { getSetupStatus } from '@/service/api/auth-api'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

export function LoginPage() {
  const { login, register, status } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requiresInitialUser, setRequiresInitialUser] = useState<boolean | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')

  const redirect = searchParams.get('redirect')

  useEffect(() => {
    if (status === 'authenticated') {
      const target = redirect && redirect.startsWith('/') ? redirect : '/'
      navigate(target, { replace: true })
    }
  }, [navigate, status, redirect])

  useEffect(() => {
    void getSetupStatus()
      .then((result) => setRequiresInitialUser(result.requiresInitialUser))
      .catch(() => setRequiresInitialUser(false))
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = ((formData.get('email') as string) || '').trim()
    const password = (formData.get('password') as string) || ''
    const remember = formData.get('remember') !== null

    if (requiresInitialUser && password !== confirmPassword) {
      setError('Passwords do not match.')
      setIsSubmitting(false)
      return
    }

    if (!email || !password || (requiresInitialUser && !((formData.get('name') as string) || '').trim())) {
      setError(requiresInitialUser ? 'Name, email, and password are required.' : 'Email and password are required.')
      setIsSubmitting(false)
      return
    }

    try {
      if (requiresInitialUser) {
        await register(((formData.get('name') as string) || '').trim(), email, password)
      } else {
        await login(email, password, remember)
      }
      const target = redirect && redirect.startsWith('/') ? redirect : '/'
      navigate(target, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="Sign In" />
      <form onSubmit={handleSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>{requiresInitialUser ? 'Create the first administrator' : 'Sign in to your account'}</Heading>
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {requiresInitialUser ? (
        <Field>
          <Label>Full name</Label>
          <Input name="name" autoComplete="name" required />
        </Field>
      ) : null}
      <Field>
        <Label>Email</Label>
        <Input type="email" name="email" autoComplete="email" required />
      </Field>
      <Field>
        <Label>Password</Label>
        <Input type="password" name="password" autoComplete={requiresInitialUser ? 'new-password' : 'current-password'} required />
      </Field>
      {requiresInitialUser ? (
        <Field>
          <Label>Confirm password</Label>
          <Input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </Field>
      ) : null}
      {!requiresInitialUser ? <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" name="remember" className="size-4" />
          <Label>Remember me</Label>
        </label>
        <Text>
          <TextLink href="/forgot-password">
            <Strong>Forgot password?</Strong>
          </TextLink>
        </Text>
      </div> : null}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (requiresInitialUser ? 'Creating administrator...' : 'Logging in...') : (requiresInitialUser ? 'Create administrator' : 'Login')}
      </Button>
      {requiresInitialUser ? null : <Text>Need an account? Ask an administrator to add you.</Text>}
    </form>
    </>
  )
}
