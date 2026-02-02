import { ProjectIntegrationsClient } from './project-integrations-client'

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default function ProjectIntegrationsPage() {
  return <ProjectIntegrationsClient />
}
