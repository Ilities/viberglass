import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { getSetupStatus, removeDemoWorkspace } from '@/service/api/setup-api'
import type { DemoWorkspace } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

/** Shown to admins while the demo workspace is loaded: it's sample data, and here's the way out. */
export function DemoWorkspaceBanner() {
  const { user, status } = useAuth()
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const [demo, setDemo] = useState<DemoWorkspace | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  // Once per mount: the app layout stays mounted across pages, and the demo is loaded from setup, outside it.
  useEffect(() => {
    if (status !== 'authenticated' || user?.role !== 'admin') return
    let cancelled = false
    getSetupStatus()
      .then((setup) => {
        if (!cancelled) setDemo(setup.demo)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [status, user])

  if (!demo) return null

  async function handleRemove() {
    setIsRemoving(true)
    try {
      await removeDemoWorkspace()
      setDemo(null)
      toast.success('The demo workspace was removed.')
      if (pathname.startsWith(`/project/${demo?.slug}`)) navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove the demo workspace.")
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
    >
      <span className="grow">
        You're exploring <strong>{demo.name}</strong>, a demo space with sample data.
      </span>
      <Button href="/setup" plain>
        Set up your own
      </Button>
      <Button plain onClick={() => void handleRemove()} disabled={isRemoving}>
        {isRemoving ? 'Removing…' : 'Remove demo'}
      </Button>
    </div>
  )
}
