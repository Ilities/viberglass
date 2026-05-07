import type { AgentSessionEvent } from '@/service/api/session-api'
import type { ParticipantInfo } from '@/service/api/session-api'
import { useMemo } from 'react'

/**
 * Derives presence state (who is currently viewing) from SSE events.
 * Presence events (user_joined, user_left, presence_update) are ephemeral
 * and managed in-memory on the server.
 */
export function useSessionPresence(events: AgentSessionEvent[]): ParticipantInfo[] {
  return useMemo(() => {
    const users = new Map<string, ParticipantInfo>()

    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]

      if (event.eventType === 'presence_update') {
        const userList = event.payloadJson.users as Array<{ userId: string; userName: string; avatarUrl: string | null }> | undefined
        if (userList) {
          for (const u of userList) {
            users.set(u.userId, {
              userId: u.userId,
              name: u.userName,
              avatarUrl: u.avatarUrl,
              lastActiveAt: event.createdAt,
            })
          }
        }
        // presence_update is authoritative — return immediately
        break
      }

      if (event.eventType === 'user_joined') {
        const p = event.payloadJson
        const userId = p.userId as string
        const userName = p.userName as string
        const avatarUrl = (p.avatarUrl as string | null) ?? null
        if (userId && !users.has(userId)) {
          users.set(userId, {
            userId,
            name: userName,
            avatarUrl,
            lastActiveAt: event.createdAt,
          })
        }
      }

      if (event.eventType === 'user_left') {
        const userId = event.payloadJson.userId as string
        if (userId) users.delete(userId)
      }
    }

    return [...users.values()]
  }, [events])
}
