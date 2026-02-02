import { JobsPageClient } from './jobs-page-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function JobsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <JobsPageClient project={project} />
}
