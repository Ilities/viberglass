const NAME_PATTERN = '([A-Za-z_][A-Za-z0-9_]*)'

function referencePattern(template: string): RegExp {
  const [before, after] = template.split('NAME').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`${before}${NAME_PATTERN}${after ?? ''}`, 'g')
}

/** A reference to the env var, written the first way the file accepts. */
export function formatReference(envReferences: readonly string[], name: string): string {
  return envReferences[0]?.replace('NAME', name) ?? name
}

/** The env vars a config file refers to, in order of first use. */
export function findReferencedEnvVars(envReferences: readonly string[], content: string): string[] {
  const matches = envReferences
    .flatMap((template) => Array.from(content.matchAll(referencePattern(template))))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  return Array.from(new Set(matches.map((match) => match[1])))
}

/** Why the file isn't valid JSON, or null when it is (or is empty). */
export function describeJsonProblem(content: string): string | null {
  if (!content.trim()) return null
  try {
    JSON.parse(content)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid JSON'
  }
}
