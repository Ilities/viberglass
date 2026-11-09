import { useAuth } from '@/context/auth-context'
import { seesRuns } from '@/lib/roles'
import { Navigate, Outlet, useParams } from 'react-router-dom'

/** A space's Runs, Schedules and Track record: guests go to the space instead. */
export function RunReadersOnly() {
  const { user } = useAuth()
  const { project } = useParams<{ project: string }>()
  if (!seesRuns(user?.role)) return <Navigate to={`/spaces/${project}`} replace />
  return <Outlet />
}
