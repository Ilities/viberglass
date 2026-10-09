import type { WebhookEventMetadata } from '@viberglass/integration-core'
import { isObjectRecord } from '@viberglass/types'
import type { ShortcutWebhookPayload } from './shortcutWebhookTypes'
import { getNestedRecord, toIdentifier, toNonEmptyString } from './shortcutValues'

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isObjectRecord(value) ? value : undefined
}

function extractIssueNumber(payload: Record<string, unknown>): string | undefined {
  const issueNumber = getRecord(payload.issue)?.number
  if (typeof issueNumber === 'number') return issueNumber.toString()

  const pullRequestNumber = getRecord(payload.pull_request)?.number
  if (typeof pullRequestNumber === 'number') return pullRequestNumber.toString()

  if (typeof payload.issue_number === 'number' || typeof payload.issue_number === 'string') {
    return String(payload.issue_number)
  }
  return undefined
}

function extractSender(payload: Record<string, unknown>): string | undefined {
  const senderLogin = toNonEmptyString(getRecord(payload.sender)?.login)
  if (senderLogin) return senderLogin

  const user = getRecord(payload.user)
  const userLogin = toNonEmptyString(user?.login)
  if (userLogin) return userLogin
  const userName = toNonEmptyString(user?.name)
  if (userName) return userName

  const actor = getRecord(payload.actor)
  const actorLogin = toNonEmptyString(actor?.login)
  if (actorLogin) return actorLogin
  return toNonEmptyString(actor?.name)
}

function extractCommentId(payload: Record<string, unknown>): string | undefined {
  const comment = getRecord(payload.comment)
  if (typeof comment?.id === 'number' || typeof comment?.id === 'string') return String(comment.id)
  return undefined
}

/** The generic fields a delivery may carry at its top level, before Shortcut's own fields override them. */
export function buildShortcutMetadata(payload: Record<string, unknown>): WebhookEventMetadata {
  return {
    repositoryId: toNonEmptyString(getRecord(payload.repository)?.full_name),
    issueKey: extractIssueNumber(payload),
    commentId: extractCommentId(payload),
    action: toNonEmptyString(payload.action),
    sender: extractSender(payload),
  }
}

/** Fills in the story, comment and project the normalized payload names. */
export function populateShortcutMetadata(payload: ShortcutWebhookPayload, metadata: WebhookEventMetadata): void {
  const data = payload.data
  const entityId = toIdentifier(data?.id)
  const relatedStoryId = toIdentifier(data?.story_id)

  if (entityId) metadata.issueKey = entityId

  const project = getNestedRecord(data, 'project')
  const projectId = toIdentifier(data?.project_id) || toIdentifier(project?.id)
  if (projectId) metadata.projectId = projectId

  const projectName = toNonEmptyString(project?.name)
  if (projectName) {
    metadata.repositoryId = projectName
  } else if (projectId) {
    metadata.repositoryId = projectId
  }

  if (relatedStoryId) metadata.issueKey = relatedStoryId
  if (relatedStoryId && entityId) metadata.commentId = entityId
}
