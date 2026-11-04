import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Logo } from '@/components/logo'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { listOpenableApps } from '@/service/api/app-api'
import type { OpenableApp } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/** Where app users land: the apps they may open, and nothing else of the workspace. */
export function AppsPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [apps, setApps] = useState<OpenableApp[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setApps(await listOpenableApps())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your apps")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <PageMeta title="Apps" />
      <div className="grid w-full max-w-lg grid-cols-1 gap-6">
        <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
        <Heading>Your apps</Heading>
        {error ? (
          <div className="space-y-3">
            <Text>{error}</Text>
            <Button outline onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : apps === null ? (
          <Text>Loading your apps…</Text>
        ) : apps.length === 0 ? (
          <Text>You don't have any apps yet. Ask whoever invited you to give you access to one.</Text>
        ) : (
          <ul className="divide-y divide-[var(--gray-5)] rounded-lg border border-[var(--gray-5)]">
            {apps.map((app) => (
              <li key={app.projectId} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--gray-12)]">{app.name}</p>
                  {app.state !== 'running' && <p className="text-xs text-[var(--gray-10)]">Off</p>}
                </div>
                {app.url && (
                  <Button {...(app.state === 'running' ? { color: 'brand' as const } : { outline: true })} href={app.url}>
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--gray-10)]">
          <span className="truncate">Signed in as {user?.email}</span>
          <div className="flex gap-3">
            {user?.role !== 'app_user' && (
              <Button outline href="/">
                Go to Viberglass
              </Button>
            )}
            <Button outline onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
