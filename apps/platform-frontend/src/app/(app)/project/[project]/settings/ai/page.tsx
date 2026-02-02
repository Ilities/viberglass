import { AIRedirectClient } from './ai-redirect-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function AISettingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <AIRedirectClient project={project} />
}
