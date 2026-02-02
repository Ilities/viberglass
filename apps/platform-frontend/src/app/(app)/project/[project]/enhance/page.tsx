import { EnhanceClient } from './enhance-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function EnhancePage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <EnhanceClient project={project} />
}
