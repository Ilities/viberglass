import { Link } from '@/components/link'
import { getClankersList } from '@/data'
import { useEffect, useState } from 'react'

/** One line for admins, only when the workspace can't run anything: no agent is running. */
export function WorkspaceHealth() {
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    getClankersList()
      .then((clankers) => setBroken(!clankers.some((clanker) => clanker.status === 'active')))
      .catch(() => undefined)
  }, [])

  if (!broken) return null
  return (
    <p role="status" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      No agent is running, so nobody can ask for anything yet.{' '}
      <Link href="/settings/agents" className="font-medium underline">
        Check the agents
      </Link>
    </p>
  )
}
