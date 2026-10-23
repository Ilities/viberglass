import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PageMeta } from '@/components/page-meta'
import { SegmentedControl } from '@/components/segmented-control'
import { useProject } from '@/context/project-context'
import { SchedulesTab } from './schedules-tab'
import { TemplatesTab } from './templates-tab'

type Tab = 'schedules' | 'templates'

/** `?clawTab=` opens a given view; otherwise it opens on the schedules. */
function resolveTab(value: string | null | undefined): Tab {
  return value === 'templates' ? 'templates' : 'schedules'
}

export function ClawsPage() {
  const { project: projectSlug } = useParams<{ project: string }>()
  const { project, isLoading } = useProject()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = resolveTab(searchParams.get('clawTab'))
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  // The view lives in the URL, so it can be linked to and reloaded.
  const showTab = (tab: Tab) => {
    const next = new URLSearchParams(searchParams)
    next.set('clawTab', tab)
    setSearchParams(next)
  }

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
      <PageMeta title={projectSlug ? `${projectSlug} | Schedules` : 'Schedules'} />

      <SegmentedControl
        value={activeTab}
        onChange={(value) => showTab(resolveTab(value))}
        options={[
          { value: 'schedules', label: 'Schedules' },
          { value: 'templates', label: 'Task templates' },
        ]}
      />

      <div className="mt-6">
        {activeTab === 'schedules' && (
          <SchedulesTab
            projectId={project.id}
            onCreateTemplate={() => {
              setCreatingTemplate(true)
              showTab('templates')
            }}
          />
        )}
        {activeTab === 'templates' && (
          <TemplatesTab projectId={project.id} startCreating={creatingTemplate} onStartedCreating={() => setCreatingTemplate(false)} />
        )}
      </div>
    </>
  )
}
