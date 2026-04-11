import { Logger } from "winston";
import type { BaseAgentConfig } from "./types";
import type { BaseAgent } from "./BaseAgent";
import type { AcpEventMapper } from "./acp/acpEventMapperTypes";
import type { AgentAuthLifecycle } from "./agentAuthLifecycle";
import type { AgentEndpointEnvironment } from "./agentEndpointEnvironment";
import type { IAgentGitService } from "./git/IAgentGitService";

/**
 * Runtime context supplied to plugin factory functions for auth lifecycle
 * and endpoint environment. The concrete types of callbackClient and
 * credentialProvider are known to callers but opaque to agent-core.
 */
export interface AgentRuntimeContext {
  logger: Logger;
  workDir: string;
  clankerConfig?: Record<string, unknown>;
  callbackClient: unknown;
  credentialProvider?: unknown;
  sendProgress: (
    step: string,
    message: string,
    details?: Record<string, unknown>,
  ) => Promise<void>;
}

export interface AgentPlugin<C extends BaseAgentConfig = BaseAgentConfig> {
  /** Unique identifier, matches BaseAgentConfig.name (e.g. "pi") */
  readonly id: string;

  /** Human-readable name (e.g. "Pi Coding Agent") */
  readonly displayName: string;

  /** Factory — replaces AgentFactory switch.
   * Pass gitService to inject a real git implementation (apps/viberator injects GitService).
   * Implementations may omit the parameter if they do not need one-shot git operations. */
  create(config: C, logger: Logger, gitService?: IAgentGitService): BaseAgent;

  /** Default config values, merged with { name: id } at runtime */
  readonly defaultConfig: Omit<C, "name">;

  /** Env var names the harness should read api key / endpoint from */
  readonly envAliases?: {
    apiKey?: string[];
    endpoint?: string[];
  };

  /** $HOME sub-dir where agent stores conversation state (e.g. ".pi") */
  readonly stateDir?: string;

  /** Relative file patterns that belong in .harness-config/ */
  readonly harnessConfigPatterns?: string[];

  /**
   * Optional side-effectful file materialization hook.
   * Called after each matching harness config file is written.
   */
  readonly materializeHarnessConfig?: (args: {
    configRelativePath: string;
    absoluteSourcePath: string;
    contents: string;
    homeDir: string;
  }) => Promise<void>;

  /** Optional custom ACP event mapper; falls back to generic if absent */
  readonly acpEventMapper?: AcpEventMapper;

  /** Optional per-agent auth lifecycle (e.g. Codex device auth) */
  readonly authLifecycle?: (ctx: AgentRuntimeContext) => AgentAuthLifecycle;

  /** Optional per-agent endpoint environment (e.g. OpenCode, Qwen) */
  readonly endpointEnvironment?: (ctx: AgentRuntimeContext) => AgentEndpointEnvironment;

  /** Docker image metadata — feeds the generated workerImageCatalog.json */
  readonly docker: {
    variant: string;
    repositoryName: string;
    scriptImageName: string;
    supportedAgents: string[];
    defaultForAgents: string[];
    /**
     * Set to false for agents that share a non-agent-specific image (e.g. claude-code
     * uses viberator-docker-worker). Defaults to true in the catalog generator.
     */
    isAgentImage?: boolean;
    /**
     * Custom Dockerfile path. If absent, the generator computes
     * infra/workers/docker/generated/<variant>.Dockerfile for agent images.
     */
    dockerfilePath?: string;
  };
}
