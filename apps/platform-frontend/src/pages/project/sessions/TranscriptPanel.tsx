import { Dialog, DialogBody, DialogTitle } from '@/components/dialog'
import type { AgentSessionEvent, AgentSessionEventType } from '@/service/api/session-api'
import { ChatBubbleIcon, ChevronDownIcon, ChevronRightIcon, ReaderIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useRef, useState } from 'react'

// ─── User color utility ─────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-orange-500',
]

export function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getUserInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function UserAvatar({ userId, name }: { userId: string; name: string }) {
  const color = getUserColor(userId)
  const initials = getUserInitials(name)
  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white ${color}`}>
      {initials}
    </span>
  )
}

function isSystemEvent(type: AgentSessionEventType): boolean {
  return type === 'progress' || type === 'tool_call_started' || type === 'tool_call_completed'
}

function isPresenceEvent(type: AgentSessionEventType): boolean {
  return type === 'user_joined' || type === 'user_left' || type === 'presence_update'
}

function isMarkerEvent(type: AgentSessionEventType): boolean {
  return (
    type === 'session_started' ||
    type === 'turn_started' ||
    type === 'turn_completed' ||
    type === 'turn_failed' ||
    type === 'session_completed' ||
    type === 'session_failed' ||
    type === 'session_cancelled'
  )
}

function getEventText(event: AgentSessionEvent): string {
  const p = event.payloadJson
  return (p?.text as string) || (p?.content as string) || (p?.markdown as string) || (p?.message as string) || ''
}

function getMarkerLabel(type: AgentSessionEventType): string {
  switch (type) {
    case 'session_started':
      return 'Session started'
    case 'turn_started':
      return 'Turn started'
    case 'turn_completed':
      return 'Turn completed'
    case 'turn_failed':
      return 'Turn failed'
    case 'session_completed':
      return 'Session completed'
    case 'session_failed':
      return 'Session failed'
    case 'session_cancelled':
      return 'Session cancelled'
    default:
      return type
  }
}

function getSystemLabel(event: AgentSessionEvent): string {
  const p = event.payloadJson
  switch (event.eventType) {
    case 'tool_call_started':
      return `Tool call: ${(p?.toolName as string) || 'unknown'}`
    case 'tool_call_completed':
      return `Tool completed: ${(p?.toolName as string) || 'unknown'}`
    case 'progress':
      return (p?.text as string) || (p?.message as string) || 'Progress update'
    case 'reasoning':
      return 'Reasoning'
    default:
      return event.eventType
  }
}

/** Merged group of consecutive same-type message events */
interface MessageGroup {
  type: 'user_message' | 'assistant_message' | 'reasoning'
  text: string
  timestamp: string
  id: string
  userId: string | null
}

/** Merge consecutive assistant_message and reasoning chunks into single groups, filtering presence events */
function mergeMessages(events: AgentSessionEvent[]): (AgentSessionEvent | MessageGroup)[] {
  const result: (AgentSessionEvent | MessageGroup)[] = []
  let currentGroup: MessageGroup | null = null

  for (const event of events) {
    if (isPresenceEvent(event.eventType)) continue

    if (event.eventType === 'assistant_message' || event.eventType === 'reasoning') {
      const text = getEventText(event)
      if (currentGroup && currentGroup.type === event.eventType) {
        currentGroup.text += text
        currentGroup.timestamp = event.createdAt
      } else {
        if (currentGroup) result.push(currentGroup)
        currentGroup = {
          type: event.eventType,
          text,
          timestamp: event.createdAt,
          id: `group-${event.id}`,
          userId: event.userId ?? null,
        }
      }
    } else {
      if (currentGroup) {
        result.push(currentGroup)
        currentGroup = null
      }
      if (event.eventType === 'user_message') {
        result.push({
          type: 'user_message',
          text: getEventText(event),
          timestamp: event.createdAt,
          id: `group-${event.id}`,
          userId: event.userId ?? null,
        })
      } else {
        result.push(event)
      }
    }
  }
  if (currentGroup) result.push(currentGroup)
  return result
}

function isMessageGroup(item: AgentSessionEvent | MessageGroup): item is MessageGroup {
  return 'type' in item && 'text' in item && !('eventType' in item)
}

/**
 * Ids of user-message groups that were sent while a turn was in flight
 * (i.e. arrived after a turn_started, before that turn ended). These are
 * the multiplayer queued messages, batched into the next turn on drain.
 */
function computeQueuedIds(items: (AgentSessionEvent | MessageGroup)[]): Set<string> {
  const queued = new Set<string>()
  let inTurn = false
  for (const item of items) {
    if (isMessageGroup(item)) {
      if (item.type === 'user_message' && inTurn) queued.add(item.id)
      continue
    }
    if (item.eventType === 'turn_started') {
      inTurn = true
    } else if (
      item.eventType === 'turn_completed' ||
      item.eventType === 'turn_failed' ||
      item.eventType === 'session_completed' ||
      item.eventType === 'session_failed' ||
      item.eventType === 'session_cancelled'
    ) {
      inTurn = false
    }
  }
  return queued
}

function parseActorPrefix(text: string): { actor: string | null; body: string } {
  const match = /^\[([^\]]+)\]:\s*([\s\S]*)$/.exec(text)
  if (match) return { actor: match[1], body: match[2] }
  return { actor: null, body: text }
}

// ─── Attachment parsing ───────────────────────────────────────────────────────

interface Attachment {
  title: string
  content: string
}

const ATTACHMENT_SEPARATOR = '\n\n---\n\n'
const ATTACHMENT_HEADING = /^## (.+)\n\n([\s\S]*)$/

function parseMessageWithAttachments(text: string): { body: string; attachments: Attachment[] } {
  const sections = text.split(ATTACHMENT_SEPARATOR)
  const body = sections[0]
  const attachments = sections.slice(1).map((section) => {
    const match = ATTACHMENT_HEADING.exec(section)
    if (match) return { title: match[1], content: match[2] }
    return { title: 'Context', content: section }
  })
  return { body, attachments }
}

function getAttachmentHint(title: string, content: string): string {
  if (title.toLowerCase().includes('comment')) {
    const count = content.split('\n').filter((l) => l.startsWith('- ')).length
    return `${count} comment${count !== 1 ? 's' : ''}`
  }
  const lines = content.split('\n').filter((l) => l.trim()).length
  return `${lines} lines`
}

function getAttachmentIcon(title: string): typeof ReaderIcon {
  if (title.toLowerCase().includes('comment')) return ChatBubbleIcon
  return ReaderIcon
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = useState(false)
  const Icon = getAttachmentIcon(attachment.title)
  const hint = getAttachmentHint(attachment.title, attachment.content)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--gray-5)] bg-[var(--gray-2)] px-2.5 py-1.5 text-xs text-[var(--gray-10)] transition-colors hover:border-[var(--gray-6)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-12)]"
      >
        <Icon className="h-3 w-3 shrink-0 text-[var(--gray-8)]" />
        <span className="font-medium">{attachment.title}</span>
        <span className="text-[var(--gray-6)]">·</span>
        <span className="text-[var(--gray-7)]">{hint}</span>
      </button>

      <Dialog open={open} onClose={setOpen} size="4xl">
        <DialogTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[var(--accent-9)]" />
          {attachment.title}
        </DialogTitle>
        <DialogBody>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--gray-4)] bg-[var(--gray-2)] p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--gray-11)]">
              {attachment.content}
            </pre>
          </div>
        </DialogBody>
      </Dialog>
    </>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ group, queued }: { group: MessageGroup; queued?: boolean }) {
  const isUser = group.type === 'user_message'
  const { actor, body: rawBody } = isUser ? parseActorPrefix(group.text) : { actor: null, body: group.text }
  const { body, attachments } = isUser
    ? parseMessageWithAttachments(rawBody)
    : { body: rawBody, attachments: [] }
  const showAvatar = isUser && actor && group.userId

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {queued && (
        <span className="mb-0.5 rounded-full bg-[var(--gray-3)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--gray-9)]">
          Queued
        </span>
      )}
      {isUser && actor && (
        <div className="mb-0.5 flex items-center gap-1">
          {showAvatar && <UserAvatar userId={group.userId!} name={actor} />}
          <span className="text-[10px] text-[var(--gray-8)]">{actor}</span>
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[var(--accent-9)] text-white'
            : 'border border-[var(--gray-5)] bg-[var(--gray-2)] text-[var(--gray-12)]'
        }`}
      >
        <div className="whitespace-pre-wrap">{body}</div>
        <div className={`mt-1 text-[10px] ${isUser ? 'text-white/60' : 'text-[var(--gray-8)]'}`}>
          {new Date(group.timestamp).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </div>
      </div>
      {attachments.length > 0 && (
        <div className="mt-1.5 flex max-w-[80%] flex-wrap gap-1.5">
          {attachments.map((att) => (
            <AttachmentChip key={att.title} attachment={att} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Reasoning block ─────────────────────────────────────────────────────────

function ReasoningBlock({ group }: { group: MessageGroup }) {
  return (
    <details className="group/reasoning rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-11)]">
      <summary className="cursor-pointer list-none select-none font-medium text-[var(--gray-11)] marker:content-none after:ml-2 after:text-[10px] after:text-[var(--gray-9)] after:content-['(expand)'] group-open/reasoning:after:content-['(collapse)']">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-9)] align-middle opacity-60" />
        Reasoning
      </summary>
      <div className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--gray-12)]">
        {group.text}
      </div>
    </details>
  )
}

// ─── System / marker rows ─────────────────────────────────────────────────────

function SystemEventRow({ event }: { event: AgentSessionEvent }) {
  const [expanded, setExpanded] = useState(false)
  const content = getEventText(event)
  const label = getSystemLabel(event)

  return (
    <div className="px-2">
      <button
        type="button"
        onClick={() => content && setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-[var(--gray-8)] transition-colors hover:text-[var(--gray-10)]"
      >
        {content ? (
          expanded ? (
            <ChevronDownIcon className="h-3 w-3" />
          ) : (
            <ChevronRightIcon className="h-3 w-3" />
          )
        ) : (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--gray-6)]" />
        )}
        {label}
      </button>
      {expanded && content && (
        <div className="mt-1 ml-5 rounded border border-[var(--gray-4)] bg-[var(--gray-2)] p-2 text-xs whitespace-pre-wrap text-[var(--gray-10)]">
          {content}
        </div>
      )}
    </div>
  )
}

function MarkerRow({ event }: { event: AgentSessionEvent }) {
  const label = getMarkerLabel(event.eventType)
  const isFinal =
    event.eventType === 'session_completed' ||
    event.eventType === 'session_failed' ||
    event.eventType === 'session_cancelled'

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-[var(--gray-4)]" />
      <span
        className={`text-[10px] font-medium tracking-wider uppercase ${
          isFinal ? 'text-[var(--gray-10)]' : 'text-[var(--gray-7)]'
        }`}
      >
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--gray-4)]" />
    </div>
  )
}

// ─── TranscriptPanel ──────────────────────────────────────────────────────────

export function TranscriptPanel({ events }: { events: AgentSessionEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const merged = useMemo(() => mergeMessages(events), [events])
  const queuedIds = useMemo(() => computeQueuedIds(merged), [merged])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [merged.length])

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--gray-8)]">Waiting for events...</div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3 overflow-y-auto">
      {merged.map((item) => {
        if (isMessageGroup(item)) {
          if (item.type === 'reasoning') {
            return <ReasoningBlock key={item.id} group={item} />
          }
          return <MessageBubble key={item.id} group={item} queued={queuedIds.has(item.id)} />
        }
        const event = item as AgentSessionEvent
        if (isSystemEvent(event.eventType)) {
          return <SystemEventRow key={event.id} event={event} />
        }
        if (isMarkerEvent(event.eventType)) {
          return <MarkerRow key={event.id} event={event} />
        }
        return null
      })}
      <div ref={bottomRef} />
    </div>
  )
}
