import { useAuth } from '@/context/auth-context'
import { isRunner } from '@/lib/roles'
import { Navigate, Outlet, useParams } from 'react-router-dom'

/** A space's pages for those who run agents (Runs, Schedules, creating tasks): guests and viewers go to the space instead. */
export function RunnersOnly() {
  const { user } = useAuth()
  const { project } = useParams<{ project: string }>()
  if (!isRunner(user?.role)) return <Navigate to={`/spaces/${project}`} replace />
  return <Outlet />
}
