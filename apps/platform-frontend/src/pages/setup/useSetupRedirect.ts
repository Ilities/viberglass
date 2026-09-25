import { useAuth } from '@/context/auth-context'
import { getSetupStatus } from '@/service/api/setup-api'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSetupSkipped } from './setupResume'

/**
 * Sends an admin to /setup until the workspace has a space and a working
 * agent, unless they skipped it or are exploring the demo workspace.
 */
export function useSetupRedirect(): void {
  const { user, status } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (status !== 'authenticated' || user?.role !== 'admin' || isSetupSkipped()) return
    let cancelled = false
    getSetupStatus()
      .then((setup) => {
        // While the demo is loaded they're exploring it; its banner leads back to setup.
        if (!cancelled && !setup.complete && !setup.demo) navigate('/setup', { replace: true })
      })
      // The dashboard still works without the status; setup stays reachable at /setup.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [status, user, navigate])
}
