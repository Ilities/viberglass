import { field, recordAt, type WebhookEventMetadata } from '@viberglass/integration-core'

/** A non-empty string at `key`; unlike `stringAt`, whitespace counts, as Jira's own checks are only truthiness. */
export function presentString(source: unknown, key: string): string | undefined {
  const value = field(source, key)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function presentId(source: unknown, key: string): string | undefined {
  const value = field(source, key)
  if (typeof value === 'number' && value !== 0) return value.toString()
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function jiraProjectKey(issue: Record<string, unknown> | undefined, issueKey: string | undefined): string | undefined {
  const projectKey = presentString(recordAt(recordAt(issue, 'fields'), 'project'), 'key')
  if (projectKey) return projectKey
  if (issueKey && issueKey.includes('-')) return issueKey.split('-')[0]
  return undefined
}

export function jiraProjectId(issue: Record<string, unknown> | undefined): string | undefined {
  const projectId = field(recordAt(recordAt(issue, 'fields'), 'project'), 'id')
  if (typeof projectId === 'number') return projectId.toString()
  if (typeof projectId === 'string' && projectId.length > 0) return projectId
  return undefined
}

export function jiraAction(action: unknown): string | undefined {
  if (typeof action !== 'string') return undefined
  return action.trim().toLowerCase() || undefined
}

/** Jira sends epoch milliseconds, as a number or a numeric string. */
export function jiraTimestamp(payload: Record<string, unknown>): string {
  const raw = payload.timestamp
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw).toISOString()
  if (typeof raw === 'string') {
    const asNumber = Number(raw)
    return Number.isFinite(asNumber) ? new Date(asNumber).toISOString() : raw
  }
  return (
    presentString(recordAt(payload, 'issue'), 'updated_at') ??
    presentString(recordAt(payload, 'comment'), 'updated_at') ??
    presentString(payload, 'updated_at') ??
    presentString(payload, 'created_at') ??
    new Date().toISOString()
  )
}

/** The fields shared by most senders' payloads, which Jira's own fields then override. */
export function genericMetadata(payload: Record<string, unknown>): WebhookEventMetadata {
  return {
    repositoryId: presentString(recordAt(payload, 'repository'), 'full_name'),
    issueKey:
      presentId(recordAt(payload, 'issue'), 'number') ??
      presentId(recordAt(payload, 'pull_request'), 'number') ??
      presentId(payload, 'issue_number'),
    commentId: presentId(recordAt(payload, 'comment'), 'id'),
    action: presentString(payload, 'action'),
    sender: genericSender(payload),
  }
}

function genericSender(payload: Record<string, unknown>): string | undefined {
  const user = recordAt(payload, 'user')
  const actor = recordAt(payload, 'actor')
  return (
    presentString(recordAt(payload, 'sender'), 'login') ??
    presentString(user, 'login') ??
    presentString(user, 'name') ??
    presentString(actor, 'login') ??
    presentString(actor, 'name')
  )
}
