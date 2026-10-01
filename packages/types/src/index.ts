/**
 * @viberglass/types - Shared TypeScript types for Viberglass platform
 */

// Common types
export * from './common'

// Project types
export * from './project'

// Ticket types (internal tickets)
export * from './ticket'

// External PM ticket types (Jira, Linear, GitHub, etc.)
export * from './externalTicket'

// Integration types
export * from './integration'

// Clanker types
export * from './clanker'
export * from './clankerConfig'
export * from './job'

// Run records: manifests and PR outcomes, for eval inspection
export * from './runRecord'

// Asking for changes on a build
export * from './buildRevision'

// Claw types (scheduled task execution)
export * from './claw'

// Worker image catalog and agent/image resolution helpers
export * from './workerImages'

// Model providers and which harness runs each provider's keys
export * from './modelProviders'
export * from './agentProviders'

// First-run setup API
export * from './setup'

// Secret types
export * from './secret'

// Agent session types
export * from './agentSession'

// Feature branch naming, shared by the worker and the run confirmation
export * from './branchNaming'

// Workspace roles
export * from './workspaceRole'

// Space membership and visibility
export * from './spaceAccess'

// Task keys (WEB-42)
export * from './taskKey'

// Task participants
export * from './taskParticipant'

// Task discussion, mentions and activity
export * from './taskDiscussion'

// Notifications and the Inbox
export * from './notification'
