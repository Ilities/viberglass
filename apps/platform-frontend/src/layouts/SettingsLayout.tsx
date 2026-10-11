import { SettingsNav } from '@/components/settings-nav'
import { useProject } from '@/context/project-context'
import {
  CodeIcon,
  DownloadIcon,
  GearIcon,
  InfoCircledIcon,
  Link2Icon,
  MixerHorizontalIcon,
  PersonIcon,
  ReaderIcon,
} from '@radix-ui/react-icons'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'

const MAINTAINERS_ONLY = ['repository', 'issues', 'task-defaults', 'connections', 'prompt-templates']

/** A space's settings. Everyone may read what the space is and who's in it; only its maintainers see the rest. */
export function SettingsLayout() {
  const pathname = useLocation().pathname
  const { project: slug } = useParams<{ project: string }>()
  const { project, isLoading } = useProject()
  const base = `/spaces/${slug}/settings`
  const canMaintain = Boolean(project?.viewerAccess?.canMaintain)

  if (isLoading || !project) return null
  if (!canMaintain && MAINTAINERS_ONLY.some((tab) => pathname.startsWith(`${base}/${tab}`))) return <Navigate to={`${base}/general`} replace />

  const items = [
    { name: canMaintain ? 'General' : 'About', href: `${base}/general`, icon: canMaintain ? <GearIcon /> : <InfoCircledIcon /> },
    ...(canMaintain
      ? [
          { name: 'Repository', href: `${base}/repository`, icon: <CodeIcon /> },
          { name: 'Incoming issues', href: `${base}/issues`, icon: <DownloadIcon /> },
          { name: 'Task defaults', href: `${base}/task-defaults`, icon: <MixerHorizontalIcon /> },
        ]
      : []),
    { name: 'Members', href: `${base}/members`, icon: <PersonIcon /> },
    ...(canMaintain
      ? [
          { name: 'Connections', href: `${base}/connections`, icon: <Link2Icon /> },
          { name: 'Agent instructions', href: `${base}/prompt-templates`, icon: <ReaderIcon /> },
        ]
      : []),
  ].map((item) => ({ ...item, current: pathname === item.href }))

  return (
    <div className="lg:flex lg:gap-8">
      <aside className="hidden lg:block lg:w-48 lg:flex-none lg:border-r lg:border-zinc-950/10 dark:lg:border-white/10">
        <SettingsNav sections={[{ items }]} />
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
