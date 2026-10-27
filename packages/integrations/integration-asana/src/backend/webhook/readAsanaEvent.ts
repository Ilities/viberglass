import { idAt, recordAt, stringAt, takeBotMention } from '@viberglass/integration-core'
import type { InboundWebhookAction, InboundWebhookEvent, WebhookReadSettings } from '@viberglass/integration-core'
import type { TrackerPerson } from '@viberglass/types'
import { asanaApiAccess } from '../asanaApiAccess'
import { asanaStoryTaskGid } from './asanaEvents'
import { fetchAsanaStoryText, fetchAsanaTask } from './asanaApi'

type Fetch = typeof fetch

function asanaPerson(user: Record<string, unknown> | undefined): TrackerPerson | null {
  const name = stringAt(user, 'name')
  if (!name) return null
  const gid = idAt(user, 'gid')
  return { name, email: null, ...(gid ? { accountId: gid } : {}) }
}

function taskStateChange(eventType: string, action: string | undefined): 'closed' | 'reopened' | undefined {
  if (action === 'completed' || action === 'marked_complete') return 'closed'
  if (action === 'reopened' || action === 'marked_incomplete') return 'reopened'
  void eventType
  return undefined
}

/** Reads what Asana's task and comment events carry; the rest is fetched in readAsanaEventAsync. */
export function readAsanaEvent(event: InboundWebhookEvent): InboundWebhookAction {
  const data = recordAt(event.payload, 'data') ?? (event.payload as Record<string, unknown>)
  const action = stringAt(data, 'action') ?? stringAt(data, 'type')

  switch (event.eventType) {
    case 'task_added':
    case 'task_changed': {
      const key = idAt(data, 'gid')
      if (!key) return { kind: 'ignored', reason: 'The Asana task has no id' }
      const parent = recordAt(data, 'parent')
      const projectGid = parent && stringAt(parent, 'resource_type') === 'project' ? idAt(parent, 'gid') : undefined
      const stateChange = taskStateChange(event.eventType, action)
      return {
        kind: 'issue',
        issue: {
          key,
          url: projectGid ? `https://app.asana.com/0/${projectGid}/${key}` : null,
          apiBaseUrl: null,
          title: stringAt(data, 'name'),
          author: asanaPerson(recordAt(data, 'user')),
          severity: 'medium',
          labels: [],
          repository: null,
          metadata: { asanaResourceType: 'task', ...(projectGid ? { asanaProjectId: projectGid } : {}) },
          ...(stateChange ? { stateChange } : {}),
        },
      }
    }
    case 'comment_added': {
      const issueKey = asanaStoryTaskGid(data)
      if (!issueKey) return { kind: 'ignored', reason: 'The Asana comment has no task' }
      const author = asanaPerson(recordAt(data, 'user')) ?? { name: 'An Asana user', email: null }
      return { kind: 'comment', comment: { issueKey, author, body: '', mentionsBot: false } }
    }
    default:
      return { kind: 'ignored', reason: `Unsupported Asana event '${event.eventType}'` }
  }
}

/** Asana's events are compact: the task's notes and a comment's text are fetched from the API. */
export async function readAsanaEventAsync(
  event: InboundWebhookEvent,
  settings: WebhookReadSettings,
  fetchImpl: Fetch = fetch,
): Promise<InboundWebhookAction> {
  const base = readAsanaEvent(event)
  const access = settings.credentials ? asanaApiAccess(settings.credentials) : undefined

  if (base.kind === 'issue') {
    if (!access) return base
    const details = await fetchAsanaTask(access, base.issue.key, fetchImpl).catch(() => undefined)
    if (!details) return base
    const stateChange = base.issue.stateChange ?? (details.completed === true ? 'closed' : undefined)
    return {
      kind: 'issue',
      issue: {
        ...base.issue,
        title: base.issue.title ?? details.name,
        description: details.notes ?? base.issue.description,
        labels: details.tags.length ? details.tags : base.issue.labels,
        ...(stateChange ? { stateChange } : {}),
      },
    }
  }

  if (base.kind === 'comment') {
    if (!access) throw new Error('The Asana connection has no token to read the comment text')
    const data = recordAt(event.payload, 'data') ?? (event.payload as Record<string, unknown>)
    const gid = idAt(data, 'gid')
    if (!gid) return base
    const text = await fetchAsanaStoryText(access, gid, fetchImpl)
    const bot = settings.botUsername
    const { mentionsBot, body } = takeBotMention(text, bot ? [`@${bot}`] : [])
    return { kind: 'comment', comment: { ...base.comment, body, mentionsBot } }
  }

  return base
}
