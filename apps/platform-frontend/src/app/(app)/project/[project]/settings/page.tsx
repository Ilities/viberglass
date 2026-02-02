import { SettingsRedirectClient } from './redirect-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function Settings({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <SettingsRedirectClient project={project} />
}
