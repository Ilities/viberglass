import type { TrackerCommenter, TrackerIssue } from '@viberglass/integration-core'
import type { AuthCredentials } from '@viberglass/types'
import { asanaApiAccess } from './asanaApiAccess'

type Fetch = typeof fetch

/** Comments on Asana tasks through the API; Asana keeps the Markdown as written. */
export class AsanaCommenter implements TrackerCommenter {
  constructor(
    private readonly config: AuthCredentials,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async postComment(issue: TrackerIssue, markdown: string): Promise<void> {
    const { base, token } = asanaApiAccess(this.config)
    const response = await this.fetchImpl(`${base}/tasks/${encodeURIComponent(issue.key)}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { text: markdown } }),
    })
    if (!response.ok) {
      throw new Error(`Asana didn't take the comment on task ${issue.key}: ${response.status} ${await response.text().catch(() => '')}`.trim())
    }
  }
}
