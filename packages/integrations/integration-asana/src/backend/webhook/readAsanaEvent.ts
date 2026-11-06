import { idAt, recordAt, stringAt, takeBotMention } from '@viberglass/integration-core'
import type { InboundWebhookAction, InboundWebhookEvent, WebhookReadSettings } from '@viberglass/integration-core'

/** Reads an enriched Asana task or comment event into an issue or a comment. */
export function readAsanaEvent(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
  switch (event.eventType) {
    case 'task_added':
    case 'task_changed':
      return readTask(event)
    case 'story_added':
      return readStory(event, settings)
    default:
      return { kind: 'ignored', reason: `Unsupported Asana event '${event.eventType}'` }
  }
}

function readTask(event: InboundWebhookEvent): InboundWebhookAction {
  const task = recordAt(event.payload, 'task')
  const key = idAt(event.metadata, 'issueKey')
  if (!task || !key) return { kind: 'ignored', reason: 'The Asana task is no longer available' }

  // Asana sends only the field that changed; `completed` is read from the task itself.
  const changedField = stringAt(recordAt(event.payload, 'change'), 'field')
  const stateChange = event.eventType === 'task_changed' && changedField === 'completed'
    ? (task.completed === true ? 'closed' : 'reopened')
    : undefined

  return {
    kind: 'issue',
    issue: {
      key,
      url: stringAt(task, 'permalink_url') ?? null,
      apiBaseUrl: null,
      title: stringAt(task, 'name'),
      description: typeof task.notes === 'string' ? task.notes : undefined,
      author: null,
      severity: 'medium',
      labels: [],
      repository: null,
      metadata: {},
      ...(stateChange ? { stateChange } : {}),
    },
  }
}

function readStory(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
  const story = recordAt(event.payload, 'story')
  if (!story) return { kind: 'ignored', reason: 'The Asana comment is no longer available' }
  // Asana also records system changes, such as a moved task, as stories.
  if (stringAt(story, 'resource_subtype') !== 'comment_added') return { kind: 'ignored', reason: 'The Asana story isn\'t a comment' }

  const issueKey = idAt(recordAt(story, 'target'), 'gid')
  if (!issueKey) return { kind: 'ignored', reason: 'The Asana comment has no task' }

  const bot = settings.botUsername
  const { mentionsBot, body } = takeBotMention(typeof story.text === 'string' ? story.text : '', bot ? [`@${bot}`] : [])
  const creator = recordAt(story, 'created_by')
  const accountId = idAt(creator, 'gid')
  const name = stringAt(creator, 'name') ?? 'An Asana member'
  return {
    kind: 'comment',
    comment: { issueKey, author: { name, email: null, ...(accountId ? { accountId } : {}) }, body, mentionsBot },
  }
}
