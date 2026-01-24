import { CreateTicketClient } from './create-ticket-client'

export const generateStaticParams = async () => {
  return []
}

export default async function CreateTicketPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <CreateTicketClient project={project} />
}
