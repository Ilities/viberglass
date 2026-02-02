import type { Metadata } from 'next'
import { ProjectSettingsClient } from './project-settings-client'

export const metadata: Metadata = {
  title: 'Project Settings',
}

export async function generateStaticParams() {
  return [{ project: '_' }]
}

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ project: string }>
}) {
  const { project } = await params
  return <ProjectSettingsClient project={project} />
}
