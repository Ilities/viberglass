import type { AgentType, ClankerStatus } from './clanker'
import type { ModelProviderId } from './modelProviders'

/** API contract of `/api/setup/*`, the first-run flow (ADR 0003). */

export interface SetupProvider {
  id: ModelProviderId
  displayName: string
  keyUrl: string
  keyPrefixes: string[]
  /** The agent this provider's keys run on. */
  agent: AgentType
  agentName: string
}

export interface SavedModelKey {
  provider: ModelProviderId
  providerName: string
  agent: AgentType
  agentName: string
  secretId: string
  secretName: string
}

export interface RepositoryAccess {
  /** GitHub's canonical owner/name. */
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
}

export interface SavedRepository extends RepositoryAccess {
  integrationId: string
  credentialId: string
}

export interface CreatedSpace {
  projectId: string
  name: string
  slug: string
  repositoryUrl: string
  baseBranch: string
}

export interface DefaultAgent {
  clankerId: string
  slug: string
  agent: AgentType | null | undefined
  agentName: string
  compute: 'ecs' | 'docker'
  status: ClankerStatus
  statusMessage: string | null
}

/** The sample space loaded by "Explore a demo workspace"; removable. */
export interface DemoWorkspace {
  projectId: string
  name: string
  slug: string
}

export interface SetupStatus {
  /** Providers whose key is already stored (under their default harness's env var). */
  connectedProviders: ModelProviderId[]
  repositoryConnected: boolean
  space: { projectId: string; name: string; slug: string; repositoryUrl: string } | null
  agent: { clankerId: string; agentName: string; status: ClankerStatus; statusMessage: string | null } | null
  /** A space exists and a runner can work on it; setup has nothing left to ask. */
  complete: boolean
  /** Set while the demo workspace is loaded. */
  demo: DemoWorkspace | null
}
