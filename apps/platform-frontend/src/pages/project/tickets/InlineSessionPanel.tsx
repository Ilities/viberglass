import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { useSessionEventStream } from '@/hooks/useSessionEventStream'
import {
  type AgentSessionStatus,
  cancelSession,
  getSessionDetail,
  sendMessageToSession,
  type SessionDetail,
} from '@/service/api/session-api'
import { CrossCircledIcon, ExternalLinkIcon, PaperPlaneIcon } from '@radix-ui/react-icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PendingRequestCard } from '../sessions/PendingRequestCard'
import { TranscriptPanel } from '../sessions/TranscriptPanel'

interface InlineSessionPanelProps {
  sessionId: string
  project: string
  onSessionEnded?: () => void
  onRevise?: () => void
}

function statusBadge(status: AgentSessionStatus): { label: string; color: 'green' | 'amber' | 'blue' | 'red' | 'zinc' } {
  switch (status) {
    case 'active': return { label: 'Active', color: 'blue' }
    case 'waiting_on_user': return { label: 'Waiting on you', color: 'amber' }
    case 'waiting_on_approval': return { label: 'Needs approval', color: 'amber' }
    case 'completed': return { label: 'Completed', color: 'green' }
    case 'failed': return { label: 'Failed', color: 'red' }
    case 'cancelled': return { label: 'Cancelled', color: 'zinc' }
    default: return { label: status, color: 'zinc' }
  }
}

function modeBadge(mode: string): { label: string; color: 'violet' | 'blue' | 'amber' } {
  switch (mode) {
    case 'research': return { label: 'Research', color: 'violet' }
    case 'planning': return { label: 'Planning', color: 'blue' }
    case 'execution': return { label: 'Execution', color: 'amber' }
    default: return { label: mode, color: 'blue' }
  }
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export function InlineSessionPanel({ sessionId, project, onSessionEnded, onRevise }: InlineSessionPanelProps) {
  const { user } = useAuth()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const loadDetail = useCallback(async () => {
    try {
      const d = await getSessionDetail(sessionId)
      setDetail(d)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const { events, connected } = useSessionEventStream(sessionId, detail?.latestEvents ?? [])

  const lastEvent = events.length > 0 ? events[events.length - 1] : null
  const liveStatus: AgentSessionStatus | undefined =
    lastEvent?.eventType === 'session_completed' ? 'completed'
    : lastEvent?.eventType === 'session_failed' ? 'failed'
    : lastEvent?.eventType === 'session_cancelled' ? 'cancelled'
    : lastEvent?.eventType === 'needs_input' ? 'waiting_on_user'
    : lastEvent?.eventType === 'needs_approval' ? 'waiting_on_approval'
    : undefined

  const currentStatus = liveStatus ?? detail?.session.status ?? 'active'
  const isTerminal = TERMINAL_STATUSES.has(currentStatus)

  const turnInProgress = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const t = events[i].eventType
      if (t === 'turn_completed' || t === 'turn_failed') return false
      if (t === 'turn_started') return true
    }
    return false
  })()

  useEffect(() => {
    if (liveStatus === 'waiting_on_user' || liveStatus === 'waiting_on_approval') {
      void loadDetail()
    }
  }, [liveStatus, loadDetail])

  useEffect(() => {
    if (isTerminal) {
      onSessionEnded?.()
    }
  }, [isTerminal, onSessionEnded])

  async function handleSend() {
    if (!messageText.trim() || isSending) return
    setIsSending(true)
    const prefixed = `[${user?.name ?? 'User'}]: ${messageText.trim()}`
    try {
      await sendMessageToSession(sessionId, prefixed)
      setMessageText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  async function handleCancel() {
    setIsCancelling(true)
    try {
      await cancelSession(sessionId)
      toast.success('Session cancelled')
      void loadDetail()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel session')
    } finally {
      setIsCancelling(false)
    }
  }

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-[var(--gray-9)]">Loading session...</div>
  }

  if (!detail) {
    return <div className="py-8 text-center text-sm text-red-600">Session not found</div>
  }

  const { session, pendingRequest } = detail
  const sb = statusBadge(currentStatus)
  const mb = modeBadge(session.mode)
  const showPending = pendingRequest?.status === 'open' && !isTerminal

  return (
    <div className="flex flex-col gap-3">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Badge color={mb.color}>{mb.label}</Badge>
          <Badge color={sb.color}>{sb.label}</Badge>
          {connected && <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="Live" />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            plain
            href={`/project/${project}/sessions/${sessionId}`}
            target="_blank"
            className="text-xs"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            Full view
          </Button>
          {!isTerminal && (
            <Button color="red" onClick={() => void handleCancel()} disabled={isCancelling}>
              <CrossCircledIcon className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="h-96 overflow-y-auto rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-4">
        <TranscriptPanel events={events} />
      </div>

      {/* Pending request */}
      {showPending && pendingRequest && (
        <PendingRequestCard
          sessionId={sessionId}
          pendingRequest={pendingRequest}
          onResolved={() => void loadDetail()}
        />
      )}

      {/* Revision CTA for completed document sessions */}
      {isTerminal && currentStatus === 'completed' && session.mode !== 'execution' && onRevise && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-4">
          <div>
            <p className="text-sm font-medium text-[var(--gray-12)]">Session completed</p>
            <p className="text-xs text-[var(--gray-9)]">
              Review the document, leave comments, then start a revision session when ready.
            </p>
          </div>
          <Button color="violet" onClick={onRevise}>
            <ChatBubbleIcon className="h-4 w-4" />
            Revise with Agent
          </Button>
        </div>
      )}

      {/* Free message input */}
      {!isTerminal && !showPending && (
        <div className="flex items-end gap-2 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-3">
          <textarea
            ref={inputRef}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            placeholder={turnInProgress ? 'Agent is working…' : 'Send a message… (Enter to send)'}
            disabled={turnInProgress || isSending}
            rows={2}
            className="min-h-[2.5rem] flex-1 resize-none bg-transparent text-sm text-[var(--gray-12)] placeholder:text-[var(--gray-8)] outline-none disabled:opacity-50"
          />
          <Button
            color="violet"
            onClick={() => void handleSend()}
            disabled={!messageText.trim() || turnInProgress || isSending}
          >
            <PaperPlaneIcon className="h-4 w-4" />
            Send
          </Button>
        </div>
      )}
    </div>
  )
}
