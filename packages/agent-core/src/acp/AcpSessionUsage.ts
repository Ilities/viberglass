/** Token counts in ACP's own usage fields, as a prompt's result carries them. */
export type AcpUsageFields = Partial<Record<"inputTokens" | "outputTokens" | "thoughtTokens" | "cachedReadTokens" | "cachedWriteTokens", number>>;

const FIELDS = ["inputTokens", "outputTokens", "thoughtTokens", "cachedReadTokens", "cachedWriteTokens"] as const;

const NOTHING: AcpUsageFields = Object.fromEntries(FIELDS.map((field) => [field, 0]));

/**
 * For a harness whose prompt results report the whole session's tokens so far
 * rather than the prompt's own: where its updates say what the session had
 * used, such as the one it sends when a saved session is loaded.
 */
export interface AcpSessionUsageReader {
  totalsOf(update: Record<string, unknown>): AcpUsageFields | null;
}

function fieldsOf(usage: Record<string, unknown>): AcpUsageFields {
  const fields: AcpUsageFields = {};
  for (const field of FIELDS) {
    const value = usage[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) fields[field] = value;
  }
  return fields;
}

/**
 * Turns a harness's running session totals into what each prompt used: what
 * the totals grew by since the session started or the last prompt ended. A
 * fresh session starts at nothing; a continued one at the totals it reported
 * when it was loaded, which may arrive just after the turn starts.
 */
export class AcpSessionUsage {
  private latest: AcpUsageFields | null = null;
  private before: AcpUsageFields | null = null;
  private awaitingStart = false;

  constructor(private readonly reader: AcpSessionUsageReader) {}

  noteUpdate(update: Record<string, unknown>): void {
    const totals = this.reader.totalsOf(update);
    if (!totals) return;
    this.latest = totals;
    if (!this.awaitingStart) return;
    this.before = totals;
    this.awaitingStart = false;
  }

  startSession(fresh: boolean): void {
    this.before = fresh ? NOTHING : this.latest;
    this.awaitingStart = this.before === null;
  }

  /** The prompt's own usage, or null when what the session had used before it can't be told. */
  promptShare(usage: Record<string, unknown>): AcpUsageFields | null {
    const totals = fieldsOf(usage);
    const before = this.before;
    this.before = totals;
    this.awaitingStart = false;
    if (!before) return null;
    const share: AcpUsageFields = {};
    for (const field of FIELDS) {
      const value = totals[field];
      const earlier = before[field];
      // A count the session's earlier totals didn't include can't be told apart, so it's left out.
      if (value !== undefined && earlier !== undefined) share[field] = Math.max(0, value - earlier);
    }
    return share;
  }
}
