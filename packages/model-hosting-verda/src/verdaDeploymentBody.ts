import type { ModelDeploymentMode, ModelHostDeploymentSpec } from '@viberglass/types'

export const VLLM_IMAGE = 'docker.io/vllm/vllm-openai:v0.31.0'
const VLLM_PORT = 8000
/** How long a replica stays up with no requests before the cloud scales it down. */
const IDLE_SECONDS = 300

export function verdaScaling(mode: Exclude<ModelDeploymentMode, 'stopped'>) {
  return {
    min_replica_count: mode === 'keep-warm' ? 1 : 0,
    max_replica_count: 1,
    scale_down_policy: { delay_seconds: IDLE_SECONDS },
    scale_up_policy: { delay_seconds: 0 },
    // Covers queueing through a cold start plus a long completion.
    queue_message_ttl_seconds: 1800,
    // vLLM batches concurrent requests; one replica serves several agents.
    concurrent_requests_per_replica: 16,
    scaling_triggers: { queue_load: { threshold: 1 } },
  }
}

function sharedMemoryMb(gpuCount: number): number {
  if (gpuCount >= 8) return 16384
  if (gpuCount >= 4) return 8192
  if (gpuCount >= 2) return 4096
  return 1024
}

export function verdaDeploymentBody(
  name: string,
  spec: ModelHostDeploymentSpec,
  huggingFaceSecretName: string | null,
) {
  const env = [
    // The deployment's scratch disk outlives replicas, so weights download once.
    { name: 'HF_HOME', value_or_reference_to_secret: '/data/hf-cache', type: 'plain' },
    ...(huggingFaceSecretName
      ? [{ name: 'HF_TOKEN', value_or_reference_to_secret: huggingFaceSecretName, type: 'secret' }]
      : []),
  ]
  return {
    name,
    is_spot: false,
    compute: { name: spec.flavour.id, size: spec.flavour.gpuCount },
    container_registry_settings: { is_private: false },
    scaling: verdaScaling(spec.mode === 'keep-warm' ? 'keep-warm' : 'scale-to-zero'),
    containers: [
      {
        image: VLLM_IMAGE,
        exposed_port: VLLM_PORT,
        healthcheck: { enabled: true, port: VLLM_PORT, path: '/health' },
        entrypoint_overrides: {
          enabled: true,
          entrypoint: ['vllm', 'serve'],
          cmd: [spec.model, ...spec.servingArgs],
        },
        env,
        volume_mounts: [
          { type: 'memory', mount_path: '/dev/shm', size_in_mb: sharedMemoryMb(spec.flavour.gpuCount) },
        ],
      },
    ],
  }
}
