import { DemoInstanceBanner } from '@/components/demo-instance-banner'
import { useAuth } from '@/context/auth-context'
import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

/** Pages for opening apps: signed in, but without the workspace around them. */
export function AppsLayout() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { status } = useAuth()

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate(`/login?redirect=${encodeURIComponent(pathname + search)}`, { replace: true })
    }
  }, [navigate, status, pathname, search])

  return (
    <main className="app-canvas flex min-h-dvh flex-col p-3">
      <DemoInstanceBanner className="mb-3" />
      <div className="app-frame flex grow items-center justify-center p-6 lg:p-10">
        {status === 'authenticated' ? (
          <Outlet />
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking your session...</p>
        )}
      </div>
    </main>
  )
}
