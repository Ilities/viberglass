import { Button } from '@/components/button'
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
    <div
      role="status"
      className="rounded-[7px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="font-semibold">Workspace needs attention</p>
      <p className="mt-1 mb-3">No agent is running, so nobody can ask for anything yet.</p>
      <Button href="/settings/agents" outline>
        Check the agents
      </Button>
    </div>
  )
}
