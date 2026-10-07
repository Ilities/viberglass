import type { TrackerCommenter, TrackerIssue } from '@viberglass/integration-core'
import type { ShortcutConfig } from './types'

type Fetch = typeof fetch

const SHORTCUT_API = 'https://api.app.shortcut.com/api/v3'

/** Comments on Shortcut stories through the API; Shortcut renders Markdown as is. */
export class ShortcutCommenter implements TrackerCommenter {
  constructor(
    private readonly config: Pick<ShortcutConfig, 'apiKey' | 'token'> & { baseUrl?: unknown },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async postComment(issue: TrackerIssue, markdown: string): Promise<void> {
    const token = this.config.apiKey || this.config.token
    if (!token) throw new Error('The Shortcut connection has no API token')
    const base = typeof this.config.baseUrl === 'string' && this.config.baseUrl ? this.config.baseUrl.replace(/\/+$/, '') : SHORTCUT_API
    const response = await this.fetchImpl(`${base}/stories/${encodeURIComponent(issue.key)}/comments`, {
      method: 'POST',
      headers: { 'Shortcut-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: markdown }),
    })
    if (!response.ok) {
      throw new Error(`Shortcut didn't take the comment on story ${issue.key}: ${response.status} ${await response.text().catch(() => '')}`.trim())
    }
  }
}
