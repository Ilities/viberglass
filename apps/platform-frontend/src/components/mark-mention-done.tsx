import { Button } from '@/components/button'
import { markMentionsDone } from '@/service/api/discussion-api'
import { useState } from 'react'
import { toast } from 'sonner'

/** Done with a mention without replying to it, as in a chat app. */
export function MarkMentionDone({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const done = async () => {
    setBusy(true)
    try {
      await markMentionsDone(taskId)
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to mark it done')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button plain disabled={busy} onClick={() => void done()}>
      Mark done
    </Button>
  )
}
