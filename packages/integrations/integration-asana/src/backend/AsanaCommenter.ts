import type { TrackerCommenter, TrackerIssue } from '@viberglass/integration-core'
import type { TrackerPerson } from '@viberglass/types'
import { asanaApiAccess, asanaError, asanaGet, type Fetch } from './asanaApi'
import type { AsanaConfig } from './types'

/** Comments on Asana tasks through the API; Asana takes the comment as plain text. */
export class AsanaCommenter implements TrackerCommenter {
  constructor(
    private readonly config: AsanaConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async postComment(issue: TrackerIssue, markdown: string): Promise<void> {
    const { base, token } = asanaApiAccess(this.config)
    const response = await this.fetchImpl(`${base}/tasks/${encodeURIComponent(issue.key)}/stories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'viberglass',
      },
      body: JSON.stringify({ data: { text: markdown } }),
    })
    if (!response.ok) {
      throw new Error(`Asana didn't take the comment on task ${issue.key}: ${await asanaError(response, 'the comment')}`)
    }
  }

  async findPerson(userGid: string): Promise<TrackerPerson | null> {
    try {
      const user = await asanaGet(asanaApiAccess(this.config), `/users/${encodeURIComponent(userGid)}`, 'name,email', this.fetchImpl)
      return asanaPerson(user, userGid)
    } catch (error) {
      if (error instanceof Error && error.message.includes('HTTP 404')) return null
      throw error
    }
  }
}

/** A person an Asana object names, keeping the account id for a later email lookup. */
export function asanaPerson(value: unknown, fallbackGid?: string): TrackerPerson | null {
  if (!isRecord(value)) return null
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : undefined
  if (!name) return null
  const gid = typeof value.gid === 'string' && value.gid ? value.gid : fallbackGid
  const email = typeof value.email === 'string' && value.email.trim() ? value.email.trim() : null
  return { name, email, ...(gid ? { accountId: gid } : {}) }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
