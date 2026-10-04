import { Badge } from '@/components/badge'
import type { RunnerReadiness, RunnerReadinessState } from '@viberglass/types'

const LABEL: Record<RunnerReadinessState, string> = {
  ready: 'Ready',
  needs_key: 'Needs a model key',
  needs_login: 'Needs a login',
  not_running: 'Not running',
  credential_rejected: 'Key rejected',
}

const COLOR: Record<RunnerReadinessState, 'green' | 'amber' | 'zinc' | 'red'> = {
  ready: 'green',
  needs_key: 'amber',
  needs_login: 'amber',
  not_running: 'zinc',
  credential_rejected: 'red',
}

export function readinessLabel(readiness: RunnerReadiness | undefined): string {
  return readiness ? LABEL[readiness.state] : 'Unknown'
}

/** Whether a runner can take a task: configured, running, and not rejected by its provider. */
export function RunnerReadinessBadge({ readiness }: { readiness: RunnerReadiness | undefined }) {
  return <Badge color={readiness ? COLOR[readiness.state] : 'zinc'}>{readinessLabel(readiness)}</Badge>
}
