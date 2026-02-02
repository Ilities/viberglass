import { ProjectHomeClient } from './project-home-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function Home({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <ProjectHomeClient project={project} />
}
