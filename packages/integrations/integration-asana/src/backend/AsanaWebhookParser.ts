import crypto from 'crypto'
import { InvalidWebhookPayloadError, idAt, recordAt, stringAt, type InboundWebhookEvent } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'

/** The Asana event a batch is read through: the first task or story change, else its first event. */
export function selectedAsanaEvent(payload: unknown): Record<string, unknown> | undefined {
  const events = asanaEventsOf(payload)
  if (!events) return undefined
  return events.find((event) => {
    const type = stringAt(recordAt(event, 'resource'), 'resource_type') ?? stringAt(event, 'type')
    return type === 'task' || type === 'story'
  }) ?? events[0]
}

export function asanaEventsOf(payload: unknown): Record<string, unknown>[] | undefined {
  if (!isObjectRecord(payload)) return undefined
  if (Array.isArray(payload.events)) return payload.events.filter(isObjectRecord)
  if (isObjectRecord(payload.resource)) return [payload]
  return undefined
}

function deduplicationId(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Reads an Asana delivery, a batch of compact events, as the one event the
 * delivery is acted on through. Asana names the subject by gid only, so the
 * reader fetches the task or story itself.
 */
export function parseAsanaEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent {
  const events = asanaEventsOf(payload)
  if (!events) throw new InvalidWebhookPayloadError('Asana payload must be a JSON object with an events array')

  const selected = selectedAsanaEvent(payload)
  if (!selected) {
    return {
      eventType: 'heartbeat',
      deduplicationId: headers['x-asana-delivery'] || deduplicationId({ heartbeat: new Date().toISOString() }),
      timestamp: new Date().toISOString(),
      payload,
      metadata: {},
    }
  }

  const resource = recordAt(selected, 'resource')
  const resourceType = stringAt(resource, 'resource_type') ?? stringAt(selected, 'type')
  const action = stringAt(selected, 'action')
  if (!stringAt(resource, 'gid') || !resourceType || !action) {
    throw new InvalidWebhookPayloadError("Missing required field 'events[].resource.gid', 'resource_type' or 'action'")
  }

  const parent = recordAt(selected, 'parent')
  const parentType = stringAt(parent, 'resource_type')
  const user = recordAt(selected, 'user')
  const resourceGid = idAt(resource, 'gid')
  const metadata: InboundWebhookEvent['metadata'] = {
    action,
    issueKey: resourceType === 'task' ? resourceGid : parentType === 'task' ? idAt(parent, 'gid') : undefined,
    commentId: resourceType === 'story' ? resourceGid : undefined,
    projectId: parentType === 'project' ? idAt(parent, 'gid') : undefined,
    sender: stringAt(user, 'name') ?? idAt(user, 'gid'),
  }

  return {
    eventType: `${resourceType}_${action}`,
    deduplicationId: headers['x-asana-delivery'] || deduplicationId(payload),
    timestamp: stringAt(selected, 'created_at') ?? new Date().toISOString(),
    payload,
    metadata,
  }
}
