import type { TrackerCommenter, TrackerIssue } from '@viberglass/integration-core'
import { ASANA_API, asanaHeaders, asanaToken } from './asanaApi'

type Fetch = typeof fetch

/** Comments on Asana tasks: a comment is a story added to the task. */
export class AsanaCommenter implements TrackerCommenter {
  constructor(
    private readonly config: { token?: string; apiKey?: string },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async postComment(issue: TrackerIssue, markdown: string): Promise<void> {
    const token = asanaToken(this.config)
    const response = await this.fetchImpl(`${ASANA_API}/tasks/${encodeURIComponent(issue.key)}/stories`, {
      method: 'POST',
      headers: { ...asanaHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { text: markdown } }),
    })
    if (!response.ok) {
      throw new Error(`Asana didn't take the comment on task ${issue.key}: ${response.status} ${await response.text().catch(() => '')}`.trim())
    }
  }
}
