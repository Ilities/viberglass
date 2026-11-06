import type { AuthCredentials } from '@viberglass/types'
import type { InboundWebhookEvent } from '@viberglass/integration-core'
import { idAt, recordAt, stringAt } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'
import { ASANA_API, asanaHeaders, asanaToken } from '../asanaApi'

type Fetch = typeof fetch

const TASK_FIELDS = 'name,notes,permalink_url,completed'
const STORY_FIELDS = 'resource_subtype,text,created_by.name,target.gid'

/**
 * Asana events name the task or comment and nothing more, so the task's title
 * and the comment's text are read from the API. A task or comment that's gone
 * is kept as null, so the event is ignored rather than retried forever.
 */
export async function enrichAsanaEvent(event: InboundWebhookEvent, credentials: AuthCredentials, fetchImpl: Fetch = fetch): Promise<InboundWebhookEvent> {
  const resource = recordAt(event.payload, 'resource')
  const resourceId = idAt(resource, 'gid')
  const resourceType = stringAt(resource, 'resource_type')
  if (!resourceId) return event

  const headers = asanaHeaders(asanaToken(credentials))
  if (resourceType === 'task' && (event.eventType === 'task_added' || event.eventType === 'task_changed')) {
    const task = await fetchAsanaResource(fetchImpl, `${ASANA_API}/tasks/${encodeURIComponent(resourceId)}?opt_fields=${TASK_FIELDS}`, headers)
    return withPayload(event, { task })
  }
  if (resourceType === 'story' && event.eventType === 'story_added') {
    const story = await fetchAsanaResource(fetchImpl, `${ASANA_API}/stories/${encodeURIComponent(resourceId)}?opt_fields=${STORY_FIELDS}`, headers)
    return withPayload(event, { story })
  }
  return event
}

async function fetchAsanaResource(fetchImpl: Fetch, url: string, headers: Record<string, string>): Promise<Record<string, unknown> | null> {
  const response = await fetchImpl(url, { headers })
  if (response.status === 404 || response.status === 403) return null
  if (!response.ok) throw new Error(`Asana didn't return the resource: HTTP ${response.status}`)
  const body: unknown = await response.json()
  return recordAt(body, 'data') ?? null
}

function withPayload(event: InboundWebhookEvent, detail: Record<string, unknown>): InboundWebhookEvent {
  const payload = isObjectRecord(event.payload) ? event.payload : {}
  return { ...event, payload: { ...payload, ...detail } }
}
