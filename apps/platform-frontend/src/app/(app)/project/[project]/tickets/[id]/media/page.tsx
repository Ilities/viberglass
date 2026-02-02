import { TicketMediaClient } from './ticket-media-client'

export async function generateStaticParams() {
  return [{ project: '_', id: '_' }]
}

export default async function TicketMediaPage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id } = await params
  return <TicketMediaClient project={project} id={id} />
}
