import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { useSessionEventStream } from '@/hooks/useSessionEventStream'
import {
  type AgentSession,
  type AgentSessionStatus,
  cancelSession,
  getSessionDetail,
  sendMessageToSession,
  type SessionDetail,
} from '@/service/api/session-api'
import { ChatBubbleIcon, CrossCircledIcon, ExternalLinkIcon, PaperPlaneIcon } from '@radix-ui/react-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PendingRequestCard } from '../sessions/PendingRequestCard'
import { TranscriptPanel } from '../sessions/TranscriptPanel'

interface PhaseSessionPanelProps {
  session: AgentSession
  project: string
  onSessionEnded?: () => void
  onRevise?: () => void
}

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

export function PhaseSessionPanel({ session, project, onSessionEnded, onRevise }: PhaseSessionPanelProps) {
  const { user } = useAuth()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const loadDetail = useCallback(async () => {
    try {
      const d = await getSessionDetail(session.id)
      setDetail(d)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setIsLoading(false)
    }
  }, [session.id])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const initialEvents = useMemo(() => detail?.latestEvents ?? [], [detail?.latestEvents])
  const { events, connected } = useSessionEventStream(session.id, initialEvents)

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
      await sendMessageToSession(session.id, prefixed)
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
      await cancelSession(session.id)
      toast.success('Session cancelled')
      void loadDetail()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel session')
    } finally {
      setIsCancelling(false)
    }
  }

  if (isLoading) {
    return <div className="py-4 text-center text-sm text-[var(--gray-9)]">Loading session...</div>
  }

  if (!detail) {
    return <div className="py-4 text-center text-sm text-red-600">Session not found</div>
  }

  const { session: sessionData, pendingRequest } = detail
  const sb = statusBadge(currentStatus)
  const mb = modeBadge(sessionData.mode)
  const showPending = pendingRequest?.status === 'open' && !isTerminal

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Badge color={mb.color}>{mb.label}</Badge>
          <Badge color={sb.color}>{sb.label}</Badge>
          {connected && <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="Live" />}
        </div>
        <div className="flex items-center gap-2">
          <Button plain href={`/project/${project}/sessions/${session.id}`} target="_blank" className="text-xs">
            <ExternalLinkIcon className="h-3 w-3" />
            Full view
          </Button>
          {!isTerminal && (
            <Button color="red" onClick={() => void handleCancel()} disabled={isCancelling}>
              <CrossCircledIcon className="h-3 w-3" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-4">
        <TranscriptPanel events={events} />
      </div>

      {showPending && pendingRequest && (
        <PendingRequestCard
          sessionId={session.id}
          pendingRequest={pendingRequest}
          onResolved={() => void loadDetail()}
        />
      )}

      {isTerminal && currentStatus === 'completed' && sessionData.mode !== 'execution' && onRevise && (
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
            className="min-h-[2.5rem] flex-1 resize-none bg-transparent text-sm text-[var(--gray-12)] outline-none placeholder:text-[var(--gray-8)] disabled:opacity-50"
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

interface PhaseNoSessionProps {
  mode: 'research' | 'planning' | 'execution'
  onStartSession: () => void
}

export function PhaseNoSession({ mode, onStartSession }: PhaseNoSessionProps) {
  const modeLabels = {
    research: 'Start Research Session',
    planning: 'Start Planning Session',
    execution: 'Start Execution Session',
  }

  const modeDescriptions = {
    research: 'Start an interactive research session to guide the agent.',
    planning: 'Start an interactive planning session to refine the plan.',
    execution: 'Start an interactive execution session to guide the agent.',
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-8 text-center">
      <ChatBubbleIcon className="h-8 w-8 text-[var(--gray-8)]" />
      <div>
        <p className="text-sm font-medium text-[var(--gray-11)]">No active session</p>
        <p className="mt-1 text-sm text-[var(--gray-9)]">
          {modeDescriptions[mode]}
        </p>
      </div>
      <Button color="brand" onClick={onStartSession}>
        <ChatBubbleIcon className="h-4 w-4" />
        {modeLabels[mode]}
      </Button>
    </div>
  )
}