import { Dialog, DialogBody, DialogTitle } from '@/components/dialog'
import type { AgentSessionEvent, AgentSessionEventType } from '@/service/api/session-api'
import { ChatBubbleIcon, ChevronDownIcon, ChevronRightIcon, ReaderIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useRef, useState } from 'react'

function isSystemEvent(type: AgentSessionEventType): boolean {
  return type === 'progress' || type === 'tool_call_started' || type === 'tool_call_completed' || type === 'reasoning'
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
  type: 'user_message' | 'assistant_message'
  text: string
  timestamp: string
  id: string
}

/** Merge consecutive assistant_message chunks into single groups */
function mergeMessages(events: AgentSessionEvent[]): (AgentSessionEvent | MessageGroup)[] {
  const result: (AgentSessionEvent | MessageGroup)[] = []
  let currentGroup: MessageGroup | null = null

  for (const event of events) {
    if (event.eventType === 'assistant_message') {
      const text = getEventText(event)
      if (currentGroup && currentGroup.type === 'assistant_message') {
        currentGroup.text += text
        currentGroup.timestamp = event.createdAt
      } else {
        if (currentGroup) result.push(currentGroup)
        currentGroup = {
          type: 'assistant_message',
          text,
          timestamp: event.createdAt,
          id: `group-${event.id}`,
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

function MessageBubble({ group }: { group: MessageGroup }) {
  const isUser = group.type === 'user_message'
  const { actor, body: rawBody } = isUser ? parseActorPrefix(group.text) : { actor: null, body: group.text }
  const { body, attachments } = isUser
    ? parseMessageWithAttachments(rawBody)
    : { body: rawBody, attachments: [] }

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {isUser && actor && (
        <div className="mb-0.5 text-[10px] text-[var(--gray-8)]">{actor}</div>
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
          return <MessageBubble key={item.id} group={item} />
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
