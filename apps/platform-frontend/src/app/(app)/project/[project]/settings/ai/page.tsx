import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Project Settings',
}

export const generateStaticParams = async () => {
  return []
}

export default async function AISettingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  redirect(`/project/${project}/settings/project`)
}
