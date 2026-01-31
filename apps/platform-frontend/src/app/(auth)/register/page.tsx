import { RegisterForm } from './register-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Register',
}

export default function Register() {
  return <RegisterForm />
}
