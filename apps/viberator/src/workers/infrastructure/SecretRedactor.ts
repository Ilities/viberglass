export const REDACTED = "[REDACTED]";

/** Shorter values match too much ordinary text to be worth replacing. */
const MIN_SECRET_LENGTH = 8;
/** Strings inside a JSON secret, such as a stored login's tokens; shorter ones are its field values like "Bearer". */
const MIN_NESTED_SECRET_LENGTH = 16;

const SECRET_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s/@:]*):[^\s/@]+@/gi, replacement: `$1:${REDACTED}@` },
  { pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[A-Za-z0-9_\-.]{20,}@/gi, replacement: `$1${REDACTED}@` },
  { pattern: /token[a-z]*["\s:=]+[a-zA-Z0-9_\-]{20,}/gi, replacement: REDACTED },
  { pattern: /password["\s:=]+[^\s]+/gi, replacement: REDACTED },
  { pattern: /sk-[a-zA-Z0-9_\-]{20,}/g, replacement: REDACTED },
  { pattern: /gh[pousr]_[a-zA-Z0-9]{36}/g, replacement: REDACTED },
  { pattern: /github_pat_[a-zA-Z0-9_]{22,}/g, replacement: REDACTED },
  { pattern: /glpat-[a-zA-Z0-9_\-]{20,}/g, replacement: REDACTED },
  { pattern: /Bearer\s+[a-zA-Z0-9_\-.]{20,}/gi, replacement: REDACTED },
];

/**
 * Takes the run's secret values out of what the worker sends the platform, along with
 * anything that looks like a credential: the agent can print its environment or a
 * remote URL with a token in it, and people who can only view a run see its output.
 */
export class SecretRedactor {
  private readonly secretValues: string[];

  constructor(secretValues: Iterable<string | undefined>) {
    const values = new Set<string>();
    for (const value of secretValues) {
      if (value) for (const form of secretForms(value)) values.add(form);
    }
    this.secretValues = [...values].sort((a, b) => b.length - a.length);
  }

  redact(text: string): string {
    let redacted = text;
    for (const value of this.secretValues) {
      if (redacted.includes(value)) redacted = redacted.split(value).join(REDACTED);
    }
    for (const { pattern, replacement } of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    return redacted;
  }

  /** Every string in a JSON-shaped value, at any depth. */
  redactValue(value: unknown): unknown {
    if (typeof value === "string") return this.redact(value);
    if (Array.isArray(value)) return value.map((item) => this.redactValue(item));
    if (isPlainObject(value)) return this.redactRecord(value);
    return value;
  }

  redactRecord(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, this.redactValue(value)]));
  }
}

function secretForms(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.length < MIN_SECRET_LENGTH) return [];
  const forms = [value, trimmed, encodeURIComponent(trimmed), ...nestedSecrets(trimmed)];
  return forms.filter((form) => form.length >= MIN_SECRET_LENGTH);
}

function nestedSecrets(value: string): string[] {
  if (!value.startsWith("{") && !value.startsWith("[")) return [];
  try {
    return stringLeaves(JSON.parse(value)).filter((leaf) => leaf.length >= MIN_NESTED_SECRET_LENGTH);
  } catch {
    return [];
  }
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (isPlainObject(value)) return Object.values(value).flatMap(stringLeaves);
  return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
