import type { AgentType, ClankerStatus } from './clanker'
import type { ModelProviderId } from './modelProviders'

/** What setup runs the default agent on: a provider's key, or a workspace model endpoint and one of its models. */
export type SetupModelChoice = { provider: ModelProviderId } | { endpointId: string; model: string }

/** API contract of `/api/setup/*`, the first-run flow. */

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
}

export interface RepositoryAccess {
  /** The code host's canonical name for the repository, such as owner/name. */
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
  compute: 'ecs' | 'docker' | 'kubernetes'
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
  /** Workspace model endpoints, which setup can run the default agent on instead of a provider's key. */
  connectedEndpoints: Array<{ id: string; name: string; models: string[] }>
  repositoryConnected: boolean
  space: { projectId: string; name: string; slug: string; repositoryUrl: string } | null
  agent: { clankerId: string; agentName: string; status: ClankerStatus; statusMessage: string | null } | null
  /** A space exists and a runner can work on it; setup has nothing left to ask. */
  complete: boolean
  /** Set while the demo workspace is loaded. */
  demo: DemoWorkspace | null
}

/** The admin's home checklist after setup: each item is ticked from real state. */
export interface SetupNextSteps {
  /** Someone besides the first admin has an account or an open invite. */
  teamInvited: boolean
  slackConnected: boolean
  /** A ticketing connection (Jira, Linear, GitHub Issues…) exists. */
  trackerConnected: boolean
}
