import { Button } from '@/components/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { makeChangeLive } from '@/service/api/build-api'
import { useState } from 'react'
import { toast } from 'sonner'

/** Accepts an App space's change, as it was when the page read it. */
export function MakeLiveButton({
  ticketId,
  pullRequestUrl,
  headSha,
  onMadeLive,
}: {
  ticketId: string
  pullRequestUrl: string
  headSha: string
  onMadeLive: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)

  const confirm = async () => {
    setSending(true)
    try {
      await makeChangeLive(ticketId, { pullRequestUrl, headSha })
      toast.success('Made live. The app changes once its new release is built and running.')
      setConfirming(false)
      onMadeLive()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't make the change live")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button color="brand" onClick={() => setConfirming(true)}>
        Make it live
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Make this change live?"
        description="Everyone using the app gets this change. The app's data is backed up first, and the app is briefly unavailable while it switches over. If the new version doesn't start, the current one keeps running."
        confirmLabel="Make it live"
        confirmingLabel="Making it live…"
        destructive={false}
        isConfirming={sending}
        onConfirm={() => void confirm()}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
