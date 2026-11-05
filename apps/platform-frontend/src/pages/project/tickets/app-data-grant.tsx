import { Button } from '@/components/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { getAppDataGrant, grantAppData, withdrawAppDataGrant } from '@/service/api/app-api'
import type { AppDataGrant } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

function copyTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * For an App space's maintainers: gives the agent's next turn a copy of the
 * live app's data to read, or withdraws one no turn has taken yet.
 */
export function AppDataGrantLine({
  taskId,
  refreshKey,
  onChanged,
}: {
  taskId: string
  refreshKey: string
  onChanged: () => void
}) {
  const [grant, setGrant] = useState<AppDataGrant | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let current = true
    getAppDataGrant(taskId)
      .then((loaded) => current && setGrant(loaded))
      .catch(() => current && setGrant(null))
    return () => {
      current = false
    }
  }, [taskId, refreshKey])

  const give = async () => {
    setBusy(true)
    try {
      setGrant(await grantAppData(taskId))
      setConfirming(false)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't copy the app's data")
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    setBusy(true)
    try {
      await withdrawAppDataGrant(taskId)
      setGrant(null)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't withdraw the copy")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--gray-10)]">
      {grant ? (
        <>
          <span role="status">
            The agent's next turn gets a copy of the app's data from {copyTime(grant.copiedAt)}.
          </span>
          <Button plain onClick={() => void withdraw()} disabled={busy}>
            Withdraw
          </Button>
        </>
      ) : (
        <Button plain onClick={() => setConfirming(true)}>
          Give the next turn the app's data
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        title="Give the agent the app's data?"
        description="Viberglass copies the live app's data now. The agent's next turn on this task can read the copy, so what it reads also goes to the agent's model provider. The copy is deleted once that turn ends, and the agent never changes the live data."
        confirmLabel="Copy the data"
        confirmingLabel="Copying…"
        destructive={false}
        isConfirming={busy}
        onConfirm={() => void give()}
        onClose={() => setConfirming(false)}
      />
    </div>
  )
}
