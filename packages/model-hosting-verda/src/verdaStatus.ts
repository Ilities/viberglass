import type { ModelDeploymentStatus } from '@viberglass/types'

const FAILURES: Record<string, string> = {
  unhealthy: 'The container is unhealthy. Check its logs in the Verda console.',
  quota_reached: 'The Verda account has reached its GPU quota.',
}

/** Replica states on the way up: waiting for a GPU, pulling the image, loading the model. */
const STARTING = new Set(['unavailable', 'initializing', 'imagepulling'])

export function verdaStatus(status: string, replicaStatuses: string[]): ModelDeploymentStatus {
  if (status === 'paused') return { state: 'stopped' }
  if (replicaStatuses.includes('running')) return { state: 'running' }
  // Verda reports a deployment unhealthy while its replica boots, so replicas decide first.
  if (replicaStatuses.some((replica) => STARTING.has(replica))) return { state: 'waking' }
  if (status in FAILURES) return { state: 'failed', detail: FAILURES[status] }
  if (status === 'healthy' || status === 'degraded') return { state: 'idle' }
  if (status === 'initializing' || status === 'image_pulling' || status === 'updating')
    return { state: 'creating' }
  return { state: 'unknown', detail: `Verda reports “${status}”.` }
}
