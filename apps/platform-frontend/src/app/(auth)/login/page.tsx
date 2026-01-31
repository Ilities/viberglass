import { LoginForm } from './login-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login',
}

export default function Login() {
  return <LoginForm />
}
