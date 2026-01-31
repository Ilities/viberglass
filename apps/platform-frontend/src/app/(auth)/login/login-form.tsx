'use client'

import { Logo } from '@/app/logo'
import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Strong, Text, TextLink } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export function LoginForm() {
  const { login, status } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/')
    }
  }, [router, status])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = ((formData.get('email') as string) || '').trim()
    const password = (formData.get('password') as string) || ''
    const remember = formData.get('remember') !== null

    if (!email || !password) {
      setError('Email and password are required.')
      setIsSubmitting(false)
      return
    }

    try {
      await login(email, password, remember)
      router.replace('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <Heading>Sign in to your account</Heading>
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      <Field>
        <Label>Email</Label>
        <Input type="email" name="email" autoComplete="email" required />
      </Field>
      <Field>
        <Label>Password</Label>
        <Input type="password" name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between">
        <CheckboxField>
          <Checkbox name="remember" />
          <Label>Remember me</Label>
        </CheckboxField>
        <Text>
          <TextLink href="/forgot-password">
            <Strong>Forgot password?</Strong>
          </TextLink>
        </Text>
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Logging in...' : 'Login'}
      </Button>
      <Text>
        Don't have an account?{' '}
        <TextLink href="/register">
          <Strong>Sign up</Strong>
        </TextLink>
      </Text>
    </form>
  )
}
