import { TicketDetailClient } from './ticket-detail-client'

export async function generateStaticParams() {
  return [{ project: '_', id: '_' }]
}

export default async function TicketDetailPage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id } = await params
  return <TicketDetailClient project={project} id={id} />
}
