import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { useProject } from '@/context/project-context'
import { Outlet, useParams } from 'react-router-dom'

/** A space's pages, or a plain "not found" when the space doesn't exist or isn't visible (the API answers 404 for both). */
export function SpaceOutlet() {
  const { project: slug } = useParams()
  const { project, isLoading } = useProject()
  if (slug && !isLoading && !project) {
    return (
      <div className="mx-auto max-w-lg py-20">
        <EmptyState
          title="This space doesn't exist, or you don't have access to it"
          description="If someone sent you this link, ask them to add you to the space."
          action={<Button href="/">Go home</Button>}
        />
      </div>
    )
  }
  return <Outlet />
}
