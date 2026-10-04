import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { getSetupStatus, removeDemoWorkspace } from '@/service/api/setup-api'
import type { DemoWorkspace } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

const DISMISSED_KEY = 'viberglass.demoBannerDismissed'

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Shown to admins while the demo workspace is loaded: it's sample data, and
 * here's the way out. Always inside the demo space, where it explains what's
 * on screen; elsewhere only on Home, until hidden, so real work isn't crowded by it.
 */
export function DemoWorkspaceBanner() {
  const { user, status } = useAuth()
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const [demo, setDemo] = useState<DemoWorkspace | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [dismissed, setDismissed] = useState(wasDismissed)

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
  const inDemo = pathname === `/spaces/${demo.slug}` || pathname.startsWith(`/spaces/${demo.slug}/`)
  if (!inDemo && (pathname !== '/' || dismissed)) return null

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Hidden for this visit only.
    }
  }

  async function handleRemove() {
    setIsRemoving(true)
    try {
      await removeDemoWorkspace()
      setDemo(null)
      toast.success('The demo workspace was removed.')
      if (pathname.startsWith(`/spaces/${demo?.slug}`)) navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove the demo workspace.")
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-4 py-3 text-sm text-[var(--gray-11)]"
    >
      <span className="grow">
        {inDemo ? (
          <>
            This is <strong>{demo.name}</strong>: sample data. Its tasks don&apos;t run agents.
          </>
        ) : (
          <>
            <strong>{demo.name}</strong> holds sample data to look around in.
          </>
        )}
      </span>
      <Button href="/setup" plain>
        Set up your own
      </Button>
      <Button plain onClick={() => void handleRemove()} disabled={isRemoving}>
        {isRemoving ? 'Removing…' : 'Remove demo'}
      </Button>
      {!inDemo && (
        <Button plain onClick={dismiss}>
          Hide
        </Button>
      )}
    </div>
  )
}
