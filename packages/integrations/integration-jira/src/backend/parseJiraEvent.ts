import crypto from 'crypto'
import { isObjectRecord } from '@viberglass/types'
import {
  field,
  idAt,
  recordAt,
  type InboundWebhookEvent,
} from '@viberglass/integration-core'
import { genericMetadata, jiraAction, jiraProjectId, jiraProjectKey, jiraTimestamp, presentString } from './jiraEventMetadata'

const EVENT_TYPES: Record<string, string> = {
  'jira:issue_created': 'issue_created',
  'jira:issue_updated': 'issue_updated',
  'jira:issue_deleted': 'issue_deleted',
  'jira:worklog_updated': 'worklog_updated',
  'jira:issue_comment_created': 'comment_created',
  'jira:issue_comment_updated': 'comment_updated',
  'jira:issue_comment_deleted': 'comment_deleted',
  comment_created: 'comment_created',
  comment_updated: 'comment_updated',
  comment_deleted: 'comment_deleted',
}

const ISSUE_EVENTS = ['issue_created', 'issue_updated', 'issue_deleted', 'comment_created', 'comment_updated', 'comment_deleted']

function eventTypeOf(webhookEvent: string, action: string | undefined, comment: Record<string, unknown> | undefined): string {
  if (webhookEvent === 'jira:issue_updated' && action === 'issue_commented' && comment) return 'comment_created'
  return EVENT_TYPES[webhookEvent] || webhookEvent
}

function requireFields(
  eventType: string,
  issue: Record<string, unknown> | undefined,
  comment: Record<string, unknown> | undefined,
): void {
  const issueKey = presentString(issue, 'key')
  const requiresIssue = ISSUE_EVENTS.includes(eventType)
  if (requiresIssue && !issueKey) {
    throw new Error("Missing required field 'issue.key'")
  }
  if (requiresIssue && !jiraProjectKey(issue, issueKey) && !jiraProjectId(issue)) {
    throw new Error("Missing required field 'issue.fields.project.key'")
  }
  if (eventType === 'issue_created' && !field(recordAt(issue, 'fields'), 'summary')) {
    throw new Error("Missing required field 'issue.fields.summary'")
  }
  const isCommentEvent = eventType.startsWith('comment_')
  if (isCommentEvent && !field(comment, 'id')) {
    throw new Error("Missing required field 'comment.id'")
  }
  if (isCommentEvent && !field(recordAt(comment, 'author'), 'displayName')) {
    throw new Error("Missing required field 'comment.author.displayName'")
  }
}

/** Reads a Jira delivery into an event, checking the fields its event type needs. */
export function parseJiraEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent {
  if (!isObjectRecord(payload)) {
    throw new Error('Jira payload must be a JSON object')
  }
  const webhookEvent = presentString(payload, 'webhookEvent')
  if (!webhookEvent) {
    throw new Error('Missing webhookEvent in payload')
  }

  const issue = recordAt(payload, 'issue')
  const comment = recordAt(payload, 'comment')
  const action = jiraAction(payload.issue_event_type_name)
  const eventType = eventTypeOf(webhookEvent, action, comment)
  requireFields(eventType, issue, comment)

  const metadata = genericMetadata(payload)
  if (issue) {
    const issueKey = presentString(issue, 'key')
    metadata.issueKey = issueKey
    const projectKey = jiraProjectKey(issue, issueKey)
    const projectId = jiraProjectId(issue)
    if (projectKey) metadata.repositoryId = projectKey
    if (projectId || projectKey) metadata.projectId = projectId || projectKey
    const reporterName = presentString(recordAt(recordAt(issue, 'fields'), 'reporter'), 'displayName')
    if (reporterName) metadata.sender = reporterName
  }
  if (comment) {
    metadata.commentId = idAt(comment, 'id')
    const commentAuthor = presentString(recordAt(comment, 'author'), 'displayName')
    if (commentAuthor) metadata.sender = commentAuthor
  }
  if (action) metadata.action = action

  return {
    eventType,
    deduplicationId: headers['x-atlassian-webhook-identifier'] || headers['x-request-id'] || crypto.randomUUID(),
    timestamp: jiraTimestamp(payload),
    payload,
    metadata,
  }
}
