import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { useAuth } from '@/context/auth-context'
import { useSessionEventStream } from '@/hooks/useSessionEventStream'
import { type AgentSessionStatus, cancelSession, getSessionDetail, sendMessageToSession, type SessionDetail } from '@/service/api/session-api'
import { ArrowLeftIcon, CrossCircledIcon, PaperPlaneIcon } from '@radix-ui/react-icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PendingRequestCard } from './PendingRequestCard'
import { TranscriptPanel } from './TranscriptPanel'

function statusBadge(status: AgentSessionStatus): {
  label: string
  color: 'green' | 'amber' | 'blue' | 'red' | 'zinc'
} {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'blue' }
    case 'waiting_on_user':
      return { label: 'Waiting on you', color: 'amber' }
    case 'waiting_on_approval':
      return { label: 'Needs approval', color: 'amber' }
    case 'completed':
      return { label: 'Completed', color: 'green' }
    case 'failed':
      return { label: 'Failed', color: 'red' }
    case 'cancelled':
      return { label: 'Cancelled', color: 'zinc' }
    default:
      return { label: status, color: 'zinc' }
  }
}

function modeBadge(mode: string): { label: string; color: 'violet' | 'blue' | 'amber' } {
  switch (mode) {
    case 'research':
      return { label: 'Research', color: 'violet' }
    case 'planning':
      return { label: 'Planning', color: 'blue' }
    case 'execution':
      return { label: 'Execution', color: 'amber' }
    default:
      return { label: mode, color: 'blue' }
  }
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export function SessionPage() {
  const { project, sessionId } = useParams<{ project: string; sessionId: string }>()
  const { user } = useAuth()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const replyRef = useRef<HTMLTextAreaElement>(null)

  const loadDetail = useCallback(async () => {
    if (!sessionId) return
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

  // Derive live status from terminal events
  const lastEvent = events.length > 0 ? events[events.length - 1] : null
  const liveStatus: AgentSessionStatus | undefined =
    lastEvent?.eventType === 'session_completed'
      ? 'completed'
      : lastEvent?.eventType === 'session_failed'
        ? 'failed'
        : lastEvent?.eventType === 'session_cancelled'
          ? 'cancelled'
          : lastEvent?.eventType === 'needs_input'
            ? 'waiting_on_user'
            : lastEvent?.eventType === 'needs_approval'
              ? 'waiting_on_approval'
              : undefined

  const currentStatus = liveStatus ?? detail?.session.status ?? 'active'
  const isTerminal = TERMINAL_STATUSES.has(currentStatus)

  // Detect whether a turn is currently running (between turn_started and turn_completed/failed)
  const turnInProgress = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const t = events[i].eventType
      if (t === 'turn_completed' || t === 'turn_failed') return false
      if (t === 'turn_started') return true
    }
    return false
  })()

  // Refresh detail when we see needs_input / needs_approval to get pendingRequest
  useEffect(() => {
    if (liveStatus === 'waiting_on_user' || liveStatus === 'waiting_on_approval') {
      void loadDetail()
    }
  }, [liveStatus, loadDetail])

  async function handleReply() {
    if (!sessionId || !replyText.trim() || isSending) return
    setIsSending(true)
    const messageText = `[${user?.name ?? 'User'}]: ${replyText.trim()}`
    try {
      await sendMessageToSession(sessionId, messageText)
      setReplyText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  async function handleCancel() {
    if (!sessionId) return
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
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--gray-9)]">Loading session...</div>
      </div>
    )
  }

  if (!detail || !project || !sessionId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600 dark:text-red-400">Session not found</div>
      </div>
    )
  }

  const { session, pendingRequest } = detail
  const sb = statusBadge(currentStatus)
  const mb = modeBadge(session.mode)
  const showPending = pendingRequest?.status === 'open' && !isTerminal

  return (
    <>
      <PageMeta title={session.title ?? `Session ${sessionId.slice(-6)}`} />
      <div className="flex h-full flex-col gap-5">
        {/* Back link */}
        <div>
          <Button href={`/project/${project}/tickets/${session.ticketId}`} plain className="-ml-1">
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Ticket
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Heading className="text-xl leading-tight">{session.title ?? `Session ${sessionId.slice(-6)}`}</Heading>
            <div className="mt-2 flex items-center gap-1.5">
              <Badge color={mb.color}>{mb.label}</Badge>
              <Badge color={sb.color}>{sb.label}</Badge>
              {connected && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-green-500" title="Live" />}
            </div>
          </div>

          {!isTerminal && (
            <Button color="red" onClick={() => void handleCancel()} disabled={isCancelling}>
              <CrossCircledIcon className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>

        {/* Transcript */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-5">
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

        {/* Reply input — shown when active and no pending request blocking */}
        {!isTerminal && !showPending && (
          <div className="flex items-end gap-2 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-3">
            <textarea
              ref={replyRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleReply()
                }
              }}
              placeholder={turnInProgress ? 'Agent is working…' : 'Send a message… (Enter to send, Shift+Enter for newline)'}
              disabled={turnInProgress || isSending}
              rows={2}
              className="min-h-[2.5rem] flex-1 resize-none bg-transparent text-sm text-[var(--gray-12)] placeholder:text-[var(--gray-8)] outline-none disabled:opacity-50"
            />
            <Button
              color="violet"
              onClick={() => void handleReply()}
              disabled={!replyText.trim() || turnInProgress || isSending}
            >
              <PaperPlaneIcon className="h-4 w-4" />
              Send
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
