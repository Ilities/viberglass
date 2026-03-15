import type { AgentSessionEvent, AgentSessionEventType } from '@/service/api/session-api'
import { ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons'
import { useEffect, useRef, useState } from 'react'

function isMessageEvent(type: AgentSessionEventType): boolean {
  return type === 'user_message' || type === 'assistant_message'
}

function isSystemEvent(type: AgentSessionEventType): boolean {
  return (
    type === 'progress' ||
    type === 'tool_call_started' ||
    type === 'tool_call_completed' ||
    type === 'reasoning'
  )
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

function getEventContent(event: AgentSessionEvent): string {
  const p = event.payloadJson
  return (p?.content as string) || (p?.markdown as string) || (p?.message as string) || ''
}

function getMarkerLabel(type: AgentSessionEventType): string {
  switch (type) {
    case 'session_started': return 'Session started'
    case 'turn_started': return 'Turn started'
    case 'turn_completed': return 'Turn completed'
    case 'turn_failed': return 'Turn failed'
    case 'session_completed': return 'Session completed'
    case 'session_failed': return 'Session failed'
    case 'session_cancelled': return 'Session cancelled'
    default: return type
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
      return (p?.message as string) || 'Progress update'
    case 'reasoning':
      return 'Reasoning'
    default:
      return event.eventType
  }
}

function MessageBubble({ event }: { event: AgentSessionEvent }) {
  const isUser = event.eventType === 'user_message'
  const content = getEventContent(event)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[var(--accent-9)] text-white'
            : 'border border-[var(--gray-5)] bg-[var(--gray-2)] text-[var(--gray-12)]'
        }`}
      >
        <div className="whitespace-pre-wrap">{content}</div>
        <div
          className={`mt-1 text-[10px] ${isUser ? 'text-white/60' : 'text-[var(--gray-8)]'}`}
        >
          {new Date(event.createdAt).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  )
}

function SystemEventRow({ event }: { event: AgentSessionEvent }) {
  const [expanded, setExpanded] = useState(false)
  const content = getEventContent(event)
  const label = getSystemLabel(event)

  return (
    <div className="px-2">
      <button
        type="button"
        onClick={() => content && setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-[var(--gray-8)] hover:text-[var(--gray-10)] transition-colors"
      >
        {content ? (
          expanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />
        ) : (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--gray-6)]" />
        )}
        {label}
      </button>
      {expanded && content && (
        <div className="ml-5 mt-1 rounded border border-[var(--gray-4)] bg-[var(--gray-2)] p-2 text-xs text-[var(--gray-10)] whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  )
}

function MarkerRow({ event }: { event: AgentSessionEvent }) {
  const label = getMarkerLabel(event.eventType)
  const isFinal = event.eventType === 'session_completed' ||
    event.eventType === 'session_failed' ||
    event.eventType === 'session_cancelled'

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-[var(--gray-4)]" />
      <span
        className={`text-[10px] font-medium uppercase tracking-wider ${
          isFinal ? 'text-[var(--gray-10)]' : 'text-[var(--gray-7)]'
        }`}
      >
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--gray-4)]" />
    </div>
  )
}

export function TranscriptPanel({ events }: { events: AgentSessionEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--gray-8)]">
        Waiting for events...
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3 overflow-y-auto">
      {events.map((event) => {
        if (isMessageEvent(event.eventType)) {
          return <MessageBubble key={event.id} event={event} />
        }
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
