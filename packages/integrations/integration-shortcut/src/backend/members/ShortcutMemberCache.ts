import type { TrackerPerson } from '@viberglass/types'

const TTL_MS = 60 * 60 * 1000
const MAX_ENTRIES = 500

/**
 * Members found by id, kept for an hour so a busy story doesn't look its
 * commenters up again for every comment. Member ids are unique across
 * workspaces, so one cache serves every connection.
 */
export class ShortcutMemberCache {
  private readonly entries = new Map<string, { person: TrackerPerson; expiresAt: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  get(memberId: string): TrackerPerson | undefined {
    const entry = this.entries.get(memberId)
    if (!entry) return undefined
    if (entry.expiresAt > this.now()) return entry.person
    this.entries.delete(memberId)
    return undefined
  }

  set(memberId: string, person: TrackerPerson): void {
    this.entries.delete(memberId)
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(memberId, { person, expiresAt: this.now() + TTL_MS })
  }
}

export const sharedShortcutMemberCache = new ShortcutMemberCache()
