import type { TrackerCommenter, TrackerIssue } from '@viberglass/integration-core'
import { asanaRequest, type AsanaConfig } from './asanaApi'

/** Posts Viberglass comments as Asana task stories. */
export class AsanaCommenter implements TrackerCommenter {
  constructor(private readonly config: AsanaConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async postComment(issue: TrackerIssue, markdown: string): Promise<void> {
    await asanaRequest(this.config, `/tasks/${encodeURIComponent(issue.key)}/stories`, this.fetchImpl, {
      method: 'POST',
      body: JSON.stringify({ data: { text: markdown } }),
    })
  }
}
