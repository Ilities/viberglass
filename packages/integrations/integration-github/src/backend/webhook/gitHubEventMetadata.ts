import type { WebhookEventMetadata } from '@viberglass/integration-core'
import { field } from '@viberglass/integration-core'

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function idText(value: unknown): string | undefined {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : undefined
}

function truthyIdText(value: unknown): string | undefined {
  return value ? idText(value) : undefined
}

function issueKeyOf(payload: Record<string, unknown>): string | undefined {
  if (payload.issue) return idText(field(payload.issue, 'number'))
  return truthyIdText(field(payload.pull_request, 'number')) ?? truthyIdText(payload.issue_number)
}

function senderOf(payload: Record<string, unknown>): string | undefined {
  if (payload.sender) return text(field(payload.sender, 'login'))
  for (const who of [payload.user, payload.actor]) {
    const name = text(field(who, 'login')) || text(field(who, 'name'))
    if (name) return name
  }
  return undefined
}

export function gitHubEventMetadata(payload: Record<string, unknown>): WebhookEventMetadata {
  const action = text(payload.action)
  return {
    repositoryId: text(field(payload.repository, 'full_name')),
    issueKey: issueKeyOf(payload),
    commentId: payload.comment ? idText(field(payload.comment, 'id')) : undefined,
    action: action || undefined,
    sender: senderOf(payload),
  }
}

/** When the subject last changed, or now when the payload doesn't say. */
export function gitHubEventTimestamp(payload: Record<string, unknown>): string {
  return (
    text(field(payload.issue, 'updated_at')) ||
    text(field(payload.comment, 'updated_at')) ||
    text(payload.timestamp) ||
    text(payload.updated_at) ||
    text(payload.created_at) ||
    new Date().toISOString()
  )
}
