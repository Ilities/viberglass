import { WebhookSettingsClient } from './webhook-settings-client'

export const generateStaticParams = async () => {
  return []
}

export default async function WebhookSettingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <WebhookSettingsClient project={project} />
}
