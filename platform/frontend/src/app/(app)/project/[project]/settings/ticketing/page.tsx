import { TicketingSettingsClient } from './ticketing-settings-client'

export const generateStaticParams = async () => {
  return []
}

export default async function TicketingSettingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <TicketingSettingsClient project={project} />
}
