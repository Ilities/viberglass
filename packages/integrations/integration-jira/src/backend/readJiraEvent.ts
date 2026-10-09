import {
  field,
  recordAt,
  stringAt,
  takeBotMention,
  type InboundWebhookAction,
  type InboundWebhookEvent,
  type WebhookReadSettings,
} from '@viberglass/integration-core'
import { jiraBrowseUrl, jiraLabels, jiraPerson, jiraSeverity, jiraSiteUrl, jiraText } from './jiraPayload'

/** How Jira writes a mention of an account: by account id on Cloud, by user name on Server, or as typed. */
function jiraMentionForms(botUsername: string | null): string[] {
  return botUsername ? [`[~accountid:${botUsername}]`, `[~${botUsername}]`, `@${botUsername}`] : []
}

function readIssue(event: InboundWebhookEvent, issue: Record<string, unknown> | undefined, key: string): InboundWebhookAction {
  const fields = recordAt(issue, 'fields')
  const self = stringAt(issue, 'self')
  const author =
    event.eventType === 'issue_created'
      ? (jiraPerson(recordAt(event.payload, 'user')) ?? jiraPerson(recordAt(fields, 'reporter')))
      : null
  return {
    kind: 'issue',
    issue: {
      key,
      url: jiraBrowseUrl(self, key),
      apiBaseUrl: jiraSiteUrl(self),
      title: stringAt(fields, 'summary'),
      // An update that doesn't carry the description leaves it as it is.
      description: field(fields, 'description') === undefined ? undefined : jiraText(fields?.description),
      author,
      severity: jiraSeverity(stringAt(recordAt(fields, 'priority'), 'name')),
      labels: jiraLabels(fields),
      repository: null,
      metadata: { issueType: stringAt(recordAt(fields, 'issuetype'), 'name'), jiraProjectKey: key.split('-')[0] },
    },
  }
}

function readComment(event: InboundWebhookEvent, issueKey: string, bot: string | null): InboundWebhookAction {
  // An issue update about a comment repeats the comment's own event.
  if (event.metadata.action === 'issue_commented') return { kind: 'ignored', reason: 'The comment arrives as its own event' }
  const comment = recordAt(event.payload, 'comment')
  const author = recordAt(comment, 'author')
  if (bot && [stringAt(author, 'accountId'), stringAt(author, 'name'), stringAt(author, 'emailAddress')].includes(bot)) {
    return { kind: 'ignored', reason: 'Written by the bot account' }
  }
  const { mentionsBot, body } = takeBotMention(jiraText(comment?.body), jiraMentionForms(bot))
  return {
    kind: 'comment',
    comment: { issueKey, author: jiraPerson(author) ?? { name: 'Someone', email: null }, body, mentionsBot },
  }
}

/** Reads Jira's issue and comment events into what they ask of a linked task. */
export function readJiraEvent(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
  const issue = recordAt(event.payload, 'issue')
  const key = stringAt(issue, 'key')
  if (!key) return { kind: 'ignored', reason: 'The Jira event has no issue' }

  switch (event.eventType) {
    case 'issue_created':
    case 'issue_updated':
      return readIssue(event, issue, key)
    case 'comment_created':
      return readComment(event, key, settings.botUsername)
    default:
      return { kind: 'ignored', reason: `Unsupported Jira event '${event.eventType}'` }
  }
}
