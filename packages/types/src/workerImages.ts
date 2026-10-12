import type { AgentType } from './clanker'
import { DEFAULT_AGENT_TYPE, isAvailableAgentType } from './agentCatalog'
import workerImageCatalogData from './workerImageCatalog.json'

export interface WorkerImageCatalogEntry {
  variant: string
  repositoryName: string
  scriptImageName: string
  dockerfilePath: string
  includeInHarnessSetup: boolean
  includeInInfraProvisioning: boolean
  includeInBuildScript: boolean
  includeInPushScript: boolean
  isAgentImage: boolean
  supportedAgents: string[]
  defaultForAgents: string[]
}

export const DEFAULT_WORKER_IMAGE_VARIANT = 'multi-agent'

export const WORKER_IMAGE_CATALOG: WorkerImageCatalogEntry[] = workerImageCatalogData

const workerImageByVariant = new Map<string, WorkerImageCatalogEntry>()
const defaultWorkerImageVariantByAgent = new Map<AgentType, string>()

for (const entry of WORKER_IMAGE_CATALOG) {
  workerImageByVariant.set(entry.variant, entry)

  for (const agentName of entry.defaultForAgents) {
    if (isAvailableAgentType(agentName)) {
      defaultWorkerImageVariantByAgent.set(agentName, entry.variant)
    }
  }
}

export function resolveWorkerImageVariantForAgent(
  agent?: string | null,
): string {
  if (!agent || !isAvailableAgentType(agent)) {
    return DEFAULT_WORKER_IMAGE_VARIANT
  }

  return (
    defaultWorkerImageVariantByAgent.get(agent) ||
    defaultWorkerImageVariantByAgent.get(DEFAULT_AGENT_TYPE) ||
    DEFAULT_WORKER_IMAGE_VARIANT
  )
}

export function getWorkerImageCatalogEntry(
  variant: string,
): WorkerImageCatalogEntry | undefined {
  return workerImageByVariant.get(variant)
}

export function getWorkerImageRepositoryName(
  variant: string,
): string | undefined {
  return workerImageByVariant.get(variant)?.repositoryName
}

export const HARNESS_WORKER_IMAGES: WorkerImageCatalogEntry[] =
  WORKER_IMAGE_CATALOG.filter((entry) => entry.includeInHarnessSetup)

export const INFRA_MANAGED_WORKER_IMAGE_REPOSITORIES: string[] =
  WORKER_IMAGE_CATALOG.filter((entry) => entry.includeInInfraProvisioning).map(
    (entry) => entry.repositoryName,
  )
