/**
 * @viberglass/types - Shared TypeScript types for Viberglass platform
 */

// Common types
export * from './common'

// What plugins say about themselves
export * from './plugin'

// Project types
export * from './project'

// Ticket types (internal tickets)
export * from './ticket'

// External PM ticket types (Jira, Linear, GitHub, etc.)
export * from './externalTicket'

// Integration types
export * from './integration'

// What inbound webhooks carry
export * from './trackerInbound'

// Clanker types
export * from './clanker'
export * from './agentCatalog'
export * from './clankerConfig'
export * from './runnerReadiness'
export * from './job'

// Run records: manifests and PR outcomes, for eval inspection
export * from './runRecord'

// Asking for changes on a build
export * from './buildRevision'
export * from './pullRequest'

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

// Workspace MCP servers and skills that runners pick from
export * from './mcpServer'
export * from './skill'

// Agent session types
export * from './agentSession'

// Questions agents ask people
export * from './agentQuestion'

// Taking a task's work over from the agent, and its branch
export * from './taskHandoff'

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

// Who approves each step
export * from './taskAskPolicy'
export * from './taskChangePolicy'
export * from './taskTimeline'
export * from './taskTurn'

// Where a comment sits in a document
export * from './documentAnchor'

// A plan's parts, each built as one pull request
export * from './planParts'

// The workspace audit log
export * from './auditLog'
export * from './taskSituation'
export * from './home'

export * from './modelEndpoints'

// Open-weight models Viberglass deploys to a customer's cloud account
export * from './modelDeployments'

export * from './objectStorage'
