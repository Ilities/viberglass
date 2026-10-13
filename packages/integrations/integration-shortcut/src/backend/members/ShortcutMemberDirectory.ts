import { recordAt, stringAt } from '@viberglass/integration-core'
import type { TrackerPerson } from '@viberglass/types'
import type { ShortcutApiAccess } from '../shortcutApiAccess'
import { sharedShortcutMemberCache, type ShortcutMemberCache } from './ShortcutMemberCache'

type Fetch = typeof fetch

/** Finds a workspace member's name and email by their member id. */
export class ShortcutMemberDirectory {
  constructor(
    private readonly access: ShortcutApiAccess,
    private readonly fetchImpl: Fetch = fetch,
    private readonly cache: ShortcutMemberCache = sharedShortcutMemberCache,
  ) {}

  async find(memberId: string): Promise<TrackerPerson | null> {
    const cached = this.cache.get(memberId)
    if (cached) return cached

    const response = await this.fetchImpl(`${this.access.base}/members/${encodeURIComponent(memberId)}`, {
      headers: { 'Shortcut-Token': this.access.token, 'Content-Type': 'application/json' },
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Shortcut didn't return member ${memberId}: ${response.status}`)

    const profile = recordAt(await response.json(), 'profile')
    const name = stringAt(profile, 'name') ?? stringAt(profile, 'mention_name')
    if (!name) return null
    const person: TrackerPerson = { name, email: stringAt(profile, 'email_address') ?? null, accountId: memberId }
    this.cache.set(memberId, person)
    return person
  }
}
