import type { TrackerCommenter, TrackerIssue } from '@viberglass/integration-core'
import type { GitHubConfig } from './types'

type Fetch = typeof fetch

const GITHUB_API = 'https://api.github.com'
/** "owner/repo#12", as linked issues are keyed. */
const ISSUE_KEY = /^([^/\s]+)\/([^#\s]+)#(\d+)$/

/** Comments on GitHub issues through the REST API; GitHub renders Markdown as is. */
export class GitHubCommenter implements TrackerCommenter {
  constructor(
    private readonly config: Pick<GitHubConfig, 'token'> & { baseUrl?: unknown },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async postComment(issue: TrackerIssue, markdown: string): Promise<void> {
    const match = issue.key.match(ISSUE_KEY)
    if (!match) throw new Error(`'${issue.key}' isn't a GitHub issue key like owner/repo#12`)
    if (!this.config.token) throw new Error('The GitHub connection has no token')
    const [, owner, repo, number] = match
    const base = typeof this.config.baseUrl === 'string' && this.config.baseUrl ? this.config.baseUrl.replace(/\/+$/, '') : GITHUB_API
    const response = await this.fetchImpl(`${base}/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: markdown }),
    })
    if (!response.ok) {
      throw new Error(`GitHub didn't take the comment on ${issue.key}: ${response.status} ${await response.text().catch(() => '')}`.trim())
    }
  }
}
