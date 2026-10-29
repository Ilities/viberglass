import { createHash } from 'crypto'
import { InvalidWebhookPayloadError, field, idAt, recordAt, stringAt } from '@viberglass/integration-core'
import type { InboundWebhookEvent } from '@viberglass/integration-core'

/** One of a delivery's events, as Asana's compact event: the resource, what happened to it and who did it. */
export function parseAsanaEvent(event: unknown): InboundWebhookEvent {
  const resource = recordAt(event, 'resource')
  const resourceId = idAt(resource, 'gid')
  const resourceType = stringAt(resource, 'resource_type')
  const action = stringAt(event, 'action')
  if (!resourceId || !resourceType || !action) {
    throw new InvalidWebhookPayloadError("Asana event has no resource, resource_type or action")
  }

  const user = idAt(recordAt(event, 'user'), 'gid')
  return {
    eventType: `${resourceType}_${action}`,
    // Asana gives events no id, so the event's own content identifies it.
    deduplicationId: createHash('sha256').update(JSON.stringify(event)).digest('hex'),
    timestamp: stringAt(event, 'created_at') ?? new Date().toISOString(),
    payload: event,
    metadata: {
      action,
      ...(user ? { sender: user } : {}),
      ...(resourceType === 'task' ? { issueKey: resourceId } : {}),
      ...(resourceType === 'story' ? { commentId: resourceId } : {}),
    },
  }
}

/** The events a delivery carries; a heartbeat carries none. */
export function splitAsanaEvents(payload: unknown): unknown[] {
  const events = field(payload, 'events')
  return Array.isArray(events) ? events : [payload]
}
