import type { TrackerCommenter, TrackerIssue } from '@viberglass/integration-core'
import type { TrackerPerson } from '@viberglass/types'
import { ShortcutMemberDirectory } from './members/ShortcutMemberDirectory'
import { shortcutApiAccess, type ShortcutConfig } from './shortcutApiAccess'

type Fetch = typeof fetch

/** Comments on Shortcut stories through the API; Shortcut renders Markdown as is. */
export class ShortcutCommenter implements TrackerCommenter {
  constructor(
    private readonly config: ShortcutConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async postComment(issue: TrackerIssue, markdown: string): Promise<void> {
    const { base, token } = shortcutApiAccess(this.config)
    const response = await this.fetchImpl(`${base}/stories/${encodeURIComponent(issue.key)}/comments`, {
      method: 'POST',
      headers: { 'Shortcut-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: markdown }),
    })
    if (!response.ok) {
      throw new Error(`Shortcut didn't take the comment on story ${issue.key}: ${response.status} ${await response.text().catch(() => '')}`.trim())
    }
  }

  /** Shortcut's comment events name their author only by member id. */
  findPerson(memberId: string): Promise<TrackerPerson | null> {
    return new ShortcutMemberDirectory(shortcutApiAccess(this.config), this.fetchImpl).find(memberId)
  }
}
