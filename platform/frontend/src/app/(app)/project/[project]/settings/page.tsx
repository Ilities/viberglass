import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Settings',
}

export default async function Settings({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  redirect(`/project/${project}/settings/widget`)
}
