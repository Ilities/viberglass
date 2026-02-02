import { JobDetailClient } from './job-detail-client'

export async function generateStaticParams() {
  return [{ project: '_', jobId: '_' }]
}

export default async function JobDetailPage({ params }: { params: Promise<{ project: string; jobId: string }> }) {
  const { project, jobId } = await params
  return <JobDetailClient project={project} jobId={jobId} />
}
