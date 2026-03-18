import { getStoredAuthToken } from '@/service/auth-storage'
import { getEventStreamUrl, isTerminalEventType, type AgentSessionEvent } from '@/service/api/session-api'
import { useEffect, useRef, useState } from 'react'

export function useSessionEventStream(
  sessionId: string | undefined,
  initialEvents: AgentSessionEvent[]
): { events: AgentSessionEvent[]; connected: boolean } {
  const [streamedEvents, setStreamedEvents] = useState<AgentSessionEvent[]>([])
  const [connected, setConnected] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const lastInitialSeq = initialEvents.length > 0
      ? Math.max(...initialEvents.map((e) => e.sequence))
      : -1

    const controller = new AbortController()
    abortRef.current = controller

    async function connect() {
      const token = getStoredAuthToken()
      const headers: Record<string, string> = { Accept: 'text/event-stream' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      try {
        const res = await fetch(getEventStreamUrl(sessionId!), {
          headers,
          signal: controller.signal,
          credentials: 'include',
        })

        if (!res.ok || !res.body) {
          setConnected(false)
          return
        }

        setConnected(true)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() ?? ''

          for (const chunk of lines) {
            const dataLine = chunk
              .split('\n')
              .find((l) => l.startsWith('data: '))
            if (!dataLine) continue

            const json = dataLine.slice(6).trim()
            if (!json || json === ':heartbeat') continue

            try {
              const event: AgentSessionEvent = JSON.parse(json)
              if (event.sequence <= lastInitialSeq) continue

              setStreamedEvents((prev) => {
                if (prev.some((e) => e.id === event.id)) return prev
                return [...prev, event]
              })

              if (isTerminalEventType(event.eventType)) {
                setConnected(false)
                return
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setConnected(false)
        }
      }
    }

    void connect()

    return () => {
      controller.abort()
      abortRef.current = null
      setConnected(false)
    }
  }, [sessionId, initialEvents])

  // Merge initial + streamed, dedup by id, sort by sequence
  const merged = [...initialEvents, ...streamedEvents]
  const seen = new Set<string>()
  const deduped: AgentSessionEvent[] = []
  for (const e of merged) {
    if (!seen.has(e.id)) {
      seen.add(e.id)
      deduped.push(e)
    }
  }
  deduped.sort((a, b) => a.sequence - b.sequence)

  return { events: deduped, connected }
}
