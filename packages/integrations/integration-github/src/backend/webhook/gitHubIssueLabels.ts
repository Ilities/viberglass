import type { Severity } from '@viberglass/types'
import { field, stringAt } from '@viberglass/integration-core'

/** The names of an issue's labels, lower-cased. */
export function gitHubLabels(issue: unknown): string[] {
  const labels = field(issue, 'labels')
  if (!Array.isArray(labels)) return []
  return labels.flatMap((label) => {
    const name = stringAt(label, 'name')?.trim().toLowerCase()
    return name ? [name] : []
  })
}

export function gitHubSeverity(labels: string[]): Severity {
  if (labels.some((label) => label.includes('critical') || label.includes('urgent'))) return 'critical'
  if (labels.some((label) => label.includes('high') || label.includes('important'))) return 'high'
  if (labels.some((label) => label.includes('medium'))) return 'medium'
  return 'low'
}
