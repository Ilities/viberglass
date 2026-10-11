import type { InboundWebhookEvent } from '@viberglass/integration-core'
import { field } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'
import { gitHubEventMetadata, gitHubEventTimestamp } from './gitHubEventMetadata'

function requireFields(eventType: string, payload: Record<string, unknown>): void {
  const isIssueEvent = eventType === 'issues' || eventType === 'issue_comment'
  if (isIssueEvent && !field(payload.repository, 'full_name')) {
    throw new Error("Missing required field 'repository.full_name'")
  }
  if (isIssueEvent && typeof field(payload.issue, 'number') !== 'number') {
    throw new Error("Missing required field 'issue.number'")
  }
  if (eventType === 'issue_comment' && typeof field(payload.comment, 'id') !== 'number') {
    throw new Error("Missing required field 'comment.id'")
  }
}

/** Reads a delivery's event from GitHub's headers; issue and comment events must name their repository and issue. */
export function parseGitHubEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent {
  const eventType = headers['x-github-event']
  const deliveryId = headers['x-github-delivery']
  if (!eventType) throw new Error('Missing x-github-event header')
  if (!deliveryId) throw new Error('Missing x-github-delivery header')
  if (!isObjectRecord(payload)) throw new Error('GitHub payload must be a JSON object')
  requireFields(eventType, payload)

  const action = typeof payload.action === 'string' ? payload.action : undefined
  return {
    eventType: action ? `${eventType}.${action}` : eventType,
    deduplicationId: deliveryId,
    timestamp: gitHubEventTimestamp(payload),
    payload,
    metadata: gitHubEventMetadata(payload),
  }
}
