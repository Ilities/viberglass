import type { ModelDeploymentStatus } from '@viberglass/types'

const FAILURES: Record<string, string> = {
  unhealthy: 'The container is unhealthy. Check its logs in the Verda console.',
  quota_reached: 'The Verda account has reached its GPU quota.',
}

export function verdaStatus(status: string, replicaStatuses: string[]): ModelDeploymentStatus {
  if (status === 'paused') return { state: 'stopped' }
  if (status in FAILURES) return { state: 'failed', detail: FAILURES[status] }
  if (replicaStatuses.includes('running')) return { state: 'running' }
  if (replicaStatuses.some((replica) => replica === 'initializing' || replica === 'imagepulling'))
    return { state: 'waking' }
  if (status === 'healthy' || status === 'degraded') return { state: 'idle' }
  if (status === 'initializing' || status === 'image_pulling' || status === 'updating')
    return { state: 'creating' }
  return { state: 'unknown', detail: `Verda reports “${status}”.` }
}
