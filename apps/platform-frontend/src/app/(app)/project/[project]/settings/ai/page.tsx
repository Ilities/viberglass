import { AISettingsClient } from './ai-settings-client'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI Settings',
}

export const generateStaticParams = async () => {
  return []
}

export default async function AISettingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <AISettingsClient project={project} />
}
