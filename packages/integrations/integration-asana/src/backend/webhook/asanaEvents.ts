import { idAt, recordAt, stringAt } from '@viberglass/integration-core'
import type { InboundWebhookEvent, WebhookEventMetadata } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'

/** Asana names an event by its resource and what happened to it. */
export function asanaEventType(resourceType: string, action: string): string {
  if (resourceType === 'story') return action === 'added' ? 'comment_added' : `comment_${action}`
  return `${resourceType}_${action}`
}

/** The task a comment belongs to: a story's parent is the task it's written on. */
export function asanaStoryTaskGid(data: Record<string, unknown>): string | undefined {
  return idAt(recordAt(data, 'parent'), 'gid')
}

/** Turns one Asana event's `data` into the parts every webhook shares. */
export function asanaEventFromData(data: Record<string, unknown>): InboundWebhookEvent | undefined {
  const gid = idAt(data, 'gid')
  const resourceType = stringAt(data, 'resource_type')
  const action = stringAt(data, 'action') ?? stringAt(data, 'type')
  if (!gid || !resourceType || !action) return undefined

  const parent = recordAt(data, 'parent')
  const user = recordAt(data, 'user')
  const createdAt = stringAt(data, 'created_at') ?? new Date().toISOString()

  const metadata: WebhookEventMetadata = { action }
  if (resourceType === 'task') metadata.issueKey = gid
  if (resourceType === 'story') {
    metadata.issueKey = asanaStoryTaskGid(data)
    metadata.commentId = gid
  }
  if (parent && stringAt(parent, 'resource_type') === 'project') metadata.projectId = idAt(parent, 'gid')
  const sender = stringAt(user, 'name')
  if (sender) metadata.sender = sender

  return {
    eventType: asanaEventType(resourceType, action),
    deduplicationId: `${gid}:${action}:${createdAt}`,
    timestamp: createdAt,
    payload: data,
    metadata,
  }
}

/** The `data` of every event in a delivery, which Asana sends as `{ events: [...] }`. */
export function asanaEventData(payload: unknown): Record<string, unknown>[] {
  if (!isObjectRecord(payload)) return []
  if (Array.isArray(payload.events)) {
    return payload.events
      .map((event) => (isObjectRecord(event) ? recordAt(event, 'data') ?? (stringAt(event, 'resource_type') ? event : undefined) : undefined))
      .filter((data): data is Record<string, unknown> => isObjectRecord(data))
  }
  // A stored delivery keeps a single event's data, so it can be parsed again on retry.
  const data = recordAt(payload, 'data') ?? payload
  return isObjectRecord(data) ? [data] : []
}
