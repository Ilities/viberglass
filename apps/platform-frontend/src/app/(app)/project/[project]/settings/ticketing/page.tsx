import { TicketingSettingsClient } from './ticketing-settings-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function TicketingSettingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <TicketingSettingsClient project={project} />
}
