import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function Settings() {
  redirect('/settings/widget')
}
