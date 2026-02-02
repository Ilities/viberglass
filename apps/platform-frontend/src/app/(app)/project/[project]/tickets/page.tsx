import { TicketsPageClient } from './tickets-page-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function TicketsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <TicketsPageClient project={project} />
}
