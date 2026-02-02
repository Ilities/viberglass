import { CreateTicketClient } from './create-ticket-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function CreateTicketPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <CreateTicketClient project={project} />
}
