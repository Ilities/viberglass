import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { TabButton } from '@/components/tab-button'
import { useProject } from '@/context/project-context'
import { SchedulesTab } from './schedules-tab'
import { TemplatesTab } from './templates-tab'

type Tab = 'schedules' | 'templates'

export function ClawsPage() {
  const { project: projectSlug } = useParams<{ project: string }>()
  const { project, isLoading } = useProject()
  const [activeTab, setActiveTab] = useState<Tab>('schedules')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!project) return null

  return (
    <>
      <PageMeta title={projectSlug ? `${projectSlug} | Claws` : 'Claws'} />

      <div className="flex items-end justify-between">
        <Heading>Claws</Heading>
      </div>

      <div className="mt-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-1">
          <TabButton active={activeTab === 'schedules'} onClick={() => setActiveTab('schedules')}>
            Schedules
          </TabButton>
          <TabButton active={activeTab === 'templates'} onClick={() => setActiveTab('templates')}>
            Task Templates
          </TabButton>
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'schedules' && <SchedulesTab projectId={project.id} />}
        {activeTab === 'templates' && <TemplatesTab projectId={project.id} />}
      </div>
    </>
  )
}
