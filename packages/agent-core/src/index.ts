// Core types
export type {
  ResourceLimits,
  BaseAgentConfig,
  SecretMetadata,
  TicketMediaContext,
  ExecutionContext,
  ExecutionResult,
  TestResult,
  AgentCLIResult,
} from "./types";

// Base agent
export { BaseAgent } from "./BaseAgent";

// Stream normalizer
export {
  AgentStreamNormalizer,
  normalizeAgentStreamLine,
} from "./agentStreamNormalizer";

// ACP layer
export type { PlatformSessionEvent } from "./acp/types";
export type { AcpEventMapper } from "./acp/acpEventMapperTypes";
export {
  defaultAcpEventMapper,
} from "./acp/acpEventMapper";
export { AcpClient } from "./acp/AcpClient";
export type { AcpRunOptions, AcpRunResult, AcpEventCallback } from "./acp/AcpClient";
export { AcpExecutor } from "./AcpExecutor";

// Git interface
export type { IAgentGitService } from "./git/IAgentGitService";
export { NoopAgentGitService } from "./git/NoopAgentGitService";

// Auth lifecycle
export type { AgentAuthContext, AgentAuthLifecycle } from "./agentAuthLifecycle";

// Endpoint environment
export type { AgentEndpointEnvironment } from "./agentEndpointEnvironment";

// Plugin & registry
export type { AgentPlugin, AgentRuntimeContext } from "./AgentPlugin";
export { AgentRegistry } from "./AgentRegistry";

// Noop implementations
export { NoopAgentAuthLifecycle } from "./noop/NoopAgentAuthLifecycle";
export { NoopAgentEndpointEnvironment } from "./noop/NoopAgentEndpointEnvironment";
