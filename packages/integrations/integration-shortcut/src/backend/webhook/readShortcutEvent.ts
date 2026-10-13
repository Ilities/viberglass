import { idAt, recordAt, stringAt, takeBotMention } from '@viberglass/integration-core'
import type { InboundWebhookAction, InboundWebhookEvent, WebhookReadSettings } from '@viberglass/integration-core'
import type { Severity } from '@viberglass/types'
import { shortcutLabels } from './shortcutLabels'
import { shortcutStateChange } from './shortcutStateChange'

const SEVERITY_OF_STORY_TYPE: Record<string, Severity> = { bug: 'high', feature: 'medium', chore: 'low' }

/** Reads Shortcut's story and comment events into an issue or a comment on one. */
export function readShortcutEvent(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
  const data = recordAt(event.payload, 'data')

  switch (event.eventType) {
    case 'story_created':
    case 'story_updated': {
      const key = idAt(data, 'id')
      if (!key) return { kind: 'ignored', reason: 'The Shortcut story has no id' }
      const storyType = stringAt(data, 'story_type') ?? 'feature'
      const description = data?.description
      const stateChange = event.eventType === 'story_updated' ? shortcutStateChange(event.payload) : undefined
      return {
        kind: 'issue',
        issue: {
          key,
          url: stringAt(data, 'app_url') ?? null,
          apiBaseUrl: null,
          title: stringAt(data, 'name'),
          description: typeof description === 'string' ? description : undefined,
          author: null,
          severity: SEVERITY_OF_STORY_TYPE[storyType] ?? 'medium',
          labels: shortcutLabels(event.payload),
          repository: null,
          metadata: { storyType, shortcutProjectId: idAt(data, 'project_id'), workflowState: stringAt(recordAt(data, 'workflow_state'), 'name') },
          ...(stateChange ? { stateChange } : {}),
        },
      }
    }
    case 'comment_created': {
      const issueKey = idAt(data, 'story_id')
      if (!issueKey) return { kind: 'ignored', reason: 'The Shortcut comment has no story' }
      const bot = settings.botUsername
      const { mentionsBot, body } = takeBotMention(stringAt(data, 'text') ?? '', bot ? [`@${bot}`] : [])
      const actor = stringAt(event.payload, 'member_id')
      const accountId = stringAt(data, 'author_id') ?? actor
      // The delivery names the member who made the change, who is usually but not always the author.
      const actorName = accountId === actor ? stringAt(event.payload, 'actor_name') : undefined
      const name = stringAt(data, 'author_name') ?? actorName ?? 'A Shortcut member'
      return { kind: 'comment', comment: { issueKey, author: { name, email: null, ...(accountId ? { accountId } : {}) }, body, mentionsBot } }
    }
    default:
      return { kind: 'ignored', reason: `Unsupported Shortcut event '${event.eventType}'` }
  }
}
