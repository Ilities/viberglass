/**
 * Values kept for a fixed time, up to a size limit; the least recently used
 * entry makes room for a new one, so a flood of new keys can't flush the rest.
 */
export class ExpiringCache<V> {
  private readonly entries = new Map<string, { value: V; until: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.until <= this.now()) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    if (this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, until: this.now() + this.ttlMs });
  }
}
