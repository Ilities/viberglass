/** How each harness config file refers to an environment variable. */
const REFERENCE_SYNTAX: Record<string, { format: (name: string) => string; pattern: RegExp }> = {
  'opencode.json': { format: (name) => `{env:${name}}`, pattern: /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g },
  'pi/models.json': { format: (name) => `$${name}`, pattern: /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g },
}

export function formatReference(fileType: string, name: string): string {
  return REFERENCE_SYNTAX[fileType]?.format(name) ?? name
}

/** The env vars a config file refers to, in order of first use. */
export function findReferencedEnvVars(fileType: string, content: string): string[] {
  const syntax = REFERENCE_SYNTAX[fileType]
  if (!syntax) return []
  return Array.from(new Set(Array.from(content.matchAll(syntax.pattern), (match) => match[1])))
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
