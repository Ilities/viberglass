import { field, idAt, recordAt, stringAt, takeBotMention, type InboundWebhookAction, type InboundWebhookEvent, type WebhookReadSettings } from '@viberglass/integration-core'
import { isObjectRecord, type InboundIssueStateChange } from '@viberglass/types'
import { selectedAsanaEvent } from './AsanaWebhookParser'
import { asanaPerson } from './AsanaCommenter'
import { asanaApiAccess, asanaGet, type AsanaApiAccess } from './asanaApi'

const TASK_FIELDS =
  'name,notes,completed,permalink_url,created_by.name,created_by.email,created_by.gid,projects.gid,projects.name,tags.name,modified_at'
const STORY_FIELDS =
  'text,html_text,type,resource_subtype,created_by.name,created_by.email,created_by.gid,target.gid,target.resource_type'

/** Reads Asana's task and comment events by fetching the task or story the compact event names. */
export async function readAsanaEvent(
  event: InboundWebhookEvent,
  settings: WebhookReadSettings,
): Promise<InboundWebhookAction> {
  if (event.eventType === 'heartbeat') return { kind: 'ignored', reason: 'Asana heartbeat' }
  const asanaEvent = selectedAsanaEvent(event.payload)
  if (!asanaEvent) return { kind: 'ignored', reason: 'The Asana delivery has no events' }
  const resource = recordAt(asanaEvent, 'resource')
  const gid = idAt(resource, 'gid')
  if (!gid) return { kind: 'ignored', reason: 'The Asana event has no resource id' }
  if (!settings.config) return { kind: 'ignored', reason: 'The Asana connection has no personal access token' }

  let access: AsanaApiAccess
  try {
    access = asanaApiAccess(settings.config)
  } catch (error) {
    return { kind: 'ignored', reason: error instanceof Error ? error.message : String(error) }
  }

  if (event.eventType.startsWith('task_')) return readTask(event, asanaEvent, gid, access)
  if (event.eventType.startsWith('story_')) return readStory(event, gid, access, settings.botUsername)
  return { kind: 'ignored', reason: `Unsupported Asana event '${event.eventType}'` }
}

async function readTask(
  event: InboundWebhookEvent,
  asanaEvent: Record<string, unknown>,
  gid: string,
  access: AsanaApiAccess,
): Promise<InboundWebhookAction> {
  if (event.eventType !== 'task_added' && event.eventType !== 'task_changed') {
    return { kind: 'ignored', reason: `Unsupported Asana event '${event.eventType}'` }
  }
  let task: Record<string, unknown>
  try {
    task = await asanaGet(access, `/tasks/${encodeURIComponent(gid)}`, TASK_FIELDS)
  } catch (error) {
    if (error instanceof Error && error.message.includes('HTTP 404')) return { kind: 'ignored', reason: 'The Asana task no longer exists' }
    throw error
  }

  const project = firstRecord(field(task, 'projects'))
  const notes = field(task, 'notes')
  const stateChange = asanaStateChange(asanaEvent, task)
  return {
    kind: 'issue',
    issue: {
      key: gid,
      url: stringAt(task, 'permalink_url') ?? null,
      apiBaseUrl: null,
      title: stringAt(task, 'name'),
      description: typeof notes === 'string' ? notes : undefined,
      author: asanaPerson(recordAt(task, 'created_by')),
      severity: 'medium',
      labels: asanaLabels(task),
      repository: null,
      metadata: {
        asanaProjectGid: idAt(project, 'gid') ?? event.metadata.projectId,
        asanaProjectName: stringAt(project, 'name'),
        completed: field(task, 'completed') === true,
      },
      ...(stateChange ? { stateChange } : {}),
    },
  }
}

async function readStory(
  event: InboundWebhookEvent,
  gid: string,
  access: AsanaApiAccess,
  botUsername: string | null,
): Promise<InboundWebhookAction> {
  if (event.eventType !== 'story_added' && event.eventType !== 'story_changed') {
    return { kind: 'ignored', reason: `Unsupported Asana event '${event.eventType}'` }
  }
  let story: Record<string, unknown>
  try {
    story = await asanaGet(access, `/stories/${encodeURIComponent(gid)}`, STORY_FIELDS)
  } catch (error) {
    if (error instanceof Error && error.message.includes('HTTP 404')) return { kind: 'ignored', reason: 'The Asana story no longer exists' }
    throw error
  }

  const type = stringAt(story, 'type')
  const subtype = stringAt(story, 'resource_subtype') ?? ''
  if ((type && type !== 'comment') || (!type && subtype && !subtype.includes('comment'))) {
    return { kind: 'ignored', reason: "Asana's story isn't a comment" }
  }

  const issueKey = idAt(recordAt(story, 'target'), 'gid') ?? event.metadata.issueKey
  if (!issueKey) return { kind: 'ignored', reason: 'The Asana comment has no task' }

  const author = recordAt(story, 'created_by')
  if (botUsername && [stringAt(author, 'name'), stringAt(author, 'email')].includes(botUsername)) {
    return { kind: 'ignored', reason: 'Written by the bot account' }
  }
  const text = stringAt(story, 'text') ?? htmlTextToPlain(stringAt(story, 'html_text') ?? '')
  const { mentionsBot, body } = takeBotMention(text, botUsername ? [`@${botUsername}`] : [])
  return {
    kind: 'comment',
    comment: {
      issueKey,
      author: asanaPerson(author) ?? { name: 'An Asana member', email: null },
      body,
      mentionsBot,
    },
  }
}

/** Whether a task update completed or reopened the task, from the field Asana says changed. */
function asanaStateChange(asanaEvent: Record<string, unknown>, task: Record<string, unknown>): InboundIssueStateChange | undefined {
  const change = recordAt(asanaEvent, 'change')
  if (stringAt(change, 'field') !== 'completed') return undefined
  const value = field(change, 'new_value')
  if (value === true || value === 'true') return 'closed'
  if (value === false || value === 'false') return 'reopened'
  return field(task, 'completed') === true ? 'closed' : 'reopened'
}

function asanaLabels(task: Record<string, unknown>): string[] {
  const tags = field(task, 'tags')
  if (!Array.isArray(tags)) return []
  return tags.flatMap((tag) => {
    const name = stringAt(tag, 'name')
    return name ? [name.toLowerCase()] : []
  })
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? value.find(isObjectRecord) : undefined
}

/** Asana's HTML comment as plain text, for comments written through its rich-text editor. */
function htmlTextToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}
