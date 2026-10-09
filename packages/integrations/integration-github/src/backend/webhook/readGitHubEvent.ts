import type { InboundWebhookAction, InboundWebhookEvent, WebhookReadSettings } from '@viberglass/integration-core'
import { field, idAt, recordAt, stringAt, takeBotMention } from '@viberglass/integration-core'
import { gitHubLabels, gitHubSeverity } from './gitHubIssueLabels'

/** Issue events that show the issue as it now is. */
const ISSUE_ACTIONS = new Set(['opened', 'edited', 'labeled'])

function readIssue(issue: Record<string, unknown>, key: string, repository: string): InboundWebhookAction {
  const labels = gitHubLabels(issue)
  const body = field(issue, 'body')
  return {
    kind: 'issue',
    issue: {
      key,
      url: stringAt(issue, 'html_url') ?? null,
      apiBaseUrl: null,
      title: stringAt(issue, 'title'),
      description: typeof body === 'string' ? body : body === null ? '' : undefined,
      author: null,
      severity: gitHubSeverity(labels),
      labels,
      repository,
      metadata: { repository },
    },
  }
}

function readComment(payload: unknown, issueKey: string, bot: string | null): InboundWebhookAction {
  const comment = recordAt(payload, 'comment')
  const user = recordAt(comment, 'user')
  const login = stringAt(user, 'login') ?? stringAt(recordAt(payload, 'sender'), 'login') ?? 'someone'
  if (stringAt(user, 'type') === 'Bot' || (bot && login.toLowerCase() === bot.toLowerCase())) {
    return { kind: 'ignored', reason: 'Written by a bot account' }
  }
  const { mentionsBot, body } = takeBotMention(stringAt(comment, 'body') ?? '', bot ? [`@${bot}`] : [])
  return { kind: 'comment', comment: { issueKey, author: { name: login, email: null }, body, mentionsBot } }
}

/** Reads GitHub's issue and issue-comment events. Issues are keyed "owner/repo#12". */
export function readGitHubEvent(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
  const payload = event.payload
  const action = stringAt(payload, 'action') ?? event.metadata.action
  const issue = recordAt(payload, 'issue')
  const repository = stringAt(recordAt(payload, 'repository'), 'full_name')
  const number = idAt(issue, 'number')
  if (!issue || !repository || !number) return { kind: 'ignored', reason: 'The GitHub event has no issue' }
  const key = `${repository}#${number}`
  const eventName = event.eventType.split('.')[0]

  if (eventName === 'issues' && action && ISSUE_ACTIONS.has(action)) return readIssue(issue, key, repository)
  if (eventName === 'issue_comment' && action === 'created') return readComment(payload, key, settings.botUsername)
  return { kind: 'ignored', reason: `Unsupported GitHub event '${eventName}.${action ?? ''}'` }
}
