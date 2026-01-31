import { ForgotPasswordForm } from './forgot-password-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Forgot password',
}

export default function ForgotPassword() {
  return <ForgotPasswordForm />
}
