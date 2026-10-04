import { Button } from '@/components/button'
import { markMentionsDone } from '@/service/api/discussion-api'
import { useState } from 'react'
import { toast } from 'sonner'

/** Done with a mention without replying to it, as in a chat app. The task itself stays as it is. */
export function MarkMentionDone({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const done = async () => {
    setBusy(true)
    try {
      await markMentionsDone(taskId)
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to acknowledge the mention')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button plain disabled={busy} onClick={() => void done()} title="Stops it being your move. The task stays open.">
      Acknowledge mention
    </Button>
  )
}
