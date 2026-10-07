import type { TrackerCommenter, TrackerIssue } from '@viberglass/integration-core'
import { jiraAuthorization } from './jiraAuth'
import { markdownToJiraWiki } from './jiraWikiMarkup'
import type { JiraConfig } from './types'

type Fetch = typeof fetch

/** Comments on Jira issues through the REST API, in wiki markup, which every Jira version takes. */
export class JiraCommenter implements TrackerCommenter {
  constructor(
    private readonly config: Pick<JiraConfig, 'instanceUrl' | 'email' | 'token' | 'username' | 'password'>,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async postComment(issue: TrackerIssue, markdown: string): Promise<void> {
    const site = (issue.apiBaseUrl ?? this.config.instanceUrl ?? '').replace(/\/+$/, '')
    if (!site) throw new Error('The Jira connection has no site URL')
    const authorization = jiraAuthorization(this.config)
    if (!authorization) throw new Error('The Jira connection has no API token')
    const response = await this.fetchImpl(`${site}/rest/api/2/issue/${encodeURIComponent(issue.key)}/comment`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ body: markdownToJiraWiki(markdown) }),
    })
    if (!response.ok) {
      throw new Error(`Jira didn't take the comment on ${issue.key}: ${response.status} ${await response.text().catch(() => '')}`.trim())
    }
  }
}
