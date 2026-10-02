import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'
import { approveSession, getSessionDetail, replyToSession, type AgentPendingRequest, type AgentSession } from '@/service/api/session-api'
import { ChatBubbleIcon, CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface PendingRequestCardProps {
  sessionId: string
  pendingRequest: AgentPendingRequest
  onResolved: () => void
}

const WAITING = ['waiting_on_user', 'waiting_on_approval']

/** The agent's open question or approval request on this task, if it has one, to answer here. */
export function TaskPendingRequest({ sessions, onResolved }: { sessions: AgentSession[]; onResolved: () => void }) {
  const waiting = sessions.find((session) => WAITING.includes(session.status))
  const waitingId = waiting?.id
  const waitingSince = waiting?.updatedAt
  const [request, setRequest] = useState<AgentPendingRequest | null>(null)

  useEffect(() => {
    if (!waitingId) {
      setRequest(null)
      return
    }
    let current = true
    getSessionDetail(waitingId)
      .then((detail) => current && setRequest(detail.pendingRequest?.status === 'open' ? detail.pendingRequest : null))
      .catch(() => current && setRequest(null))
    return () => {
      current = false
    }
  }, [waitingId, waitingSince])

  if (!waiting || !request) return null
  return <PendingRequestCard sessionId={waiting.id} pendingRequest={request} onResolved={onResolved} />
}

export function PendingRequestCard({ sessionId, pendingRequest, onResolved }: PendingRequestCardProps) {
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resolvedByOther, setResolvedByOther] = useState(false)

  async function handleReply() {
    if (!replyText.trim()) return
    setSubmitting(true)
    try {
      await replyToSession(sessionId, replyText.trim())
      setReplyText('')
      onResolved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send reply'
      if (msg.includes('not waiting') || msg.includes('already')) {
        setResolvedByOther(true)
        toast.info('Another team member already responded')
        onResolved()
      } else {
        toast.error(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApproval(approved: boolean) {
    setSubmitting(true)
    try {
      await approveSession(sessionId, approved)
      onResolved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit approval'
      if (msg.includes('not waiting') || msg.includes('already')) {
        setResolvedByOther(true)
        toast.info('Another team member already responded')
        onResolved()
      } else {
        toast.error(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isInput = pendingRequest.requestType === 'input'

  if (resolvedByOther) {
    return (
      <div className="rounded-xl border-2 border-[var(--gray-6)] bg-[var(--gray-2)] p-5">
        <div className="flex items-center gap-2 text-sm text-[var(--gray-10)]">
          <CheckCircledIcon className="h-4 w-4" />
          Another team member has already responded to this request.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border-2 border-[var(--accent-7)] bg-[var(--accent-2)] p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--accent-11)]">
        <ChatBubbleIcon className="h-4 w-4" />
        {isInput ? 'The agent asks' : 'The agent asks for approval'}
      </div>

      {pendingRequest.promptMarkdown && (
        <div className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--gray-11)]">
          {pendingRequest.promptMarkdown}
        </div>
      )}

      {isInput ? (
        <div className="flex flex-col gap-3">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            rows={3}
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                void handleReply()
              }
            }}
          />
          <div className="flex justify-end">
            <Button color="brand" onClick={() => void handleReply()} disabled={submitting || !replyText.trim()}>
              Send reply
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button color="green" onClick={() => void handleApproval(true)} disabled={submitting}>
            <CheckCircledIcon className="h-4 w-4" />
            Approve
          </Button>
          <Button color="red" onClick={() => void handleApproval(false)} disabled={submitting}>
            <CrossCircledIcon className="h-4 w-4" />
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
