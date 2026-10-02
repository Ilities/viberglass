/** A task's key is its space's prefix and its number in that space: `WEB-42`. */
export const TASK_KEY_PATTERN = /^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]*$/

export function isTaskKey(value: string): boolean {
  return TASK_KEY_PATTERN.test(value)
}

export function formatTaskKey(prefix: string, number: number): string {
  return `${prefix}-${number}`
}

/**
 * A key prefix from a space's name: the initials of a name with several
 * words ("Live Verification Project" → LVP), else its first three letters
 * ("Web" → WEB, "Payments" → PAY). A number is added when it's taken.
 */
export function deriveKeyPrefix(name: string, taken: ReadonlySet<string>): string {
  const words = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
  const initials = words.map((word) => word[0]).join('').slice(0, 4)
  const candidate = (words.length > 1 ? initials : (words[0] ?? '').slice(0, 3)).replace(/^[0-9]+/, '') || 'TASK'
  if (!taken.has(candidate)) return candidate
  for (let suffix = 2; ; suffix++) {
    const numbered = `${candidate.slice(0, 8)}${suffix}`
    if (!taken.has(numbered)) return numbered
  }
}
