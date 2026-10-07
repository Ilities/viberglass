import { Fact, FactList } from '@/components/fact-list'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { useProject } from '@/context/project-context'
import { getProjectScmConfig } from '@/service/api/project-api'
import { getSpaceMembers } from '@/service/api/space-member-api'
import type { ProjectScmConfig, SpaceMember } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { SpaceGeneralPage } from './SpaceGeneralPage'

/** A space's General tab: the settings for those who maintain it, a summary for everyone else. */
export function SpaceGeneralSettings() {
  const { project } = useProject()
  if (!project) return null
  return project.viewerAccess?.canMaintain ? <SpaceGeneralPage /> : <AboutSpacePage />
}

/** What a space is and who runs it, read-only: never the repository credentials or the forms to change it. */
export function AboutSpacePage() {
  const { project } = useProject()
  const [scm, setScm] = useState<ProjectScmConfig | null>(null)
  const [maintainers, setMaintainers] = useState<SpaceMember[]>([])
  const projectId = project?.id

  useEffect(() => {
    if (!projectId) return
    getProjectScmConfig(projectId)
      .then(setScm)
      .catch(() => setScm(null))
    getSpaceMembers(projectId)
      .then((members) => setMaintainers(members.filter((member) => member.role === 'maintainer')))
      .catch(() => setMaintainers([]))
  }, [projectId])

  if (!project) return null
  return (
    <>
      <PageMeta title={`${project.name} | About`} />
      <Heading>About this space</Heading>
      <div className="mt-6 max-w-xl">
        <FactList title={project.name}>
          <Fact label="Task keys">{project.keyPrefix}-…</Fact>
          <Fact label="Who sees it">{project.isPrivate ? 'Only its members' : 'Everyone in the workspace'}</Fact>
          <Fact label="Repository">{scm ? `${scm.sourceRepository} · ${scm.baseBranch}` : 'Not set up yet'}</Fact>
          <Fact label="Maintained by">{maintainers.length > 0 ? maintainers.map((member) => member.name).join(', ') : 'Workspace admins'}</Fact>
        </FactList>
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">Only its maintainers and workspace admins can change how this space works.</p>
      </div>
    </>
  )
}
