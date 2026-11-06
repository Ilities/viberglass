import { takeBotMention } from '@viberglass/integration-core'
import type { InboundWebhookAction, WebhookReadSettings } from '@viberglass/integration-core'
import type { AsanaEvent, AsanaStory, AsanaTask } from './asanaWebhookTypes'

function taskIssue(event: AsanaEvent, task: AsanaTask): InboundWebhookAction {
  const key = task.gid ?? event.resource?.gid
  if (!key) return { kind: 'ignored', reason: 'Asana task has no GID' }
  const projectIds = (task.memberships ?? []).flatMap((membership) => membership.project?.gid ? [membership.project.gid] : [])
  const stateChange = event.change?.field === 'completed'
    ? event.change.new_value === true ? 'closed' : event.change.new_value === false ? 'reopened' : undefined
    : undefined
  return {
    kind: 'issue',
    issue: {
      key,
      url: task.permalink_url ?? null,
      apiBaseUrl: null,
      title: task.name,
      description: task.notes,
      author: task.created_by?.name ? { name: task.created_by.name, email: null, ...(task.created_by.gid ? { accountId: task.created_by.gid } : {}) } : null,
      severity: 'medium',
      labels: (task.tags ?? []).flatMap((tag) => tag.name ? [tag.name.toLowerCase()] : []),
      repository: null,
      metadata: { projectId: projectIds[0] ?? null, projectIds, completed: task.completed ?? false },
      ...(stateChange ? { stateChange } : {}),
    },
  }
}

function taskComment(event: AsanaEvent, story: AsanaStory, settings: WebhookReadSettings): InboundWebhookAction {
  const issueKey = story.target?.gid ?? story.task?.gid ?? event.parent?.gid
  if (!issueKey) return { kind: 'ignored', reason: 'Asana comment has no parent task' }
  const author = story.created_by
  if (settings.botUsername && author?.name?.toLowerCase() === settings.botUsername.toLowerCase()) {
    return { kind: 'ignored', reason: 'Written by the configured Asana bot' }
  }
  const text = story.text ?? ''
  const { mentionsBot, body } = takeBotMention(text, settings.botUsername ? [`@${settings.botUsername}`] : [])
  return {
    kind: 'comment',
    comment: {
      issueKey,
      author: { name: author?.name ?? 'An Asana member', email: null, ...(author?.gid ? { accountId: author.gid } : {}) },
      body,
      mentionsBot,
    },
  }
}

export function readAsanaEvent(event: AsanaEvent, resource: AsanaTask | AsanaStory, settings: WebhookReadSettings): InboundWebhookAction {
  if (event.resource?.resource_type === 'task' && 'memberships' in resource) return taskIssue(event, resource)
  if (event.resource?.resource_type === 'story' && 'resource_subtype' in resource) return taskComment(event, resource, settings)
  return { kind: 'ignored', reason: `Unsupported Asana event '${event.resource?.resource_type ?? 'unknown'}.${event.action ?? ''}'` }
}
