import type { Logger } from "winston";
import type { WorkerMcpServer, WorkerSkill } from "@viberglass/types";
import type { AgentEndpointEnvironmentFactory } from "./agentEndpointEnvironmentFactory";
import { turnOptionsOf, type TurnOptions } from "./turnOptions";
import type { JobOverrides, ProjectConfigPayload, WorkerPayload } from "./types";
import { extractClankerEnvironment, normalizeAgentName, resolveClankerConfig } from "./workerConfig";

/** What a worker runs with, from its bootstrap payload: the agent, its environment, and the turn. */
export interface WorkerSettings {
  clankerConfig?: { clankerId: string } & Record<string, unknown>;
  clankerEnvironment?: Record<string, string>;
  /** The agent the payload or its clanker asks for. */
  requestedAgent?: string;
  projectConfig?: ProjectConfigPayload;
  overrides?: JobOverrides;
  turn: TurnOptions;
  /** The runner's workspace MCP servers and skills. */
  mcpServers: WorkerMcpServer[];
  skills: WorkerSkill[];
}

/** A worker started without a payload runs no turn and changes no code. */
export const NO_SETTINGS: WorkerSettings = { turn: { allowCode: false }, mcpServers: [], skills: [] };

export function workerSettingsOf(payload: WorkerPayload, endpoints: AgentEndpointEnvironmentFactory, logger: Logger): WorkerSettings {
  const clankerConfig = resolveClankerConfig(payload);
  const requestedAgent = normalizeAgentName(payload.agent) || normalizeAgentName(clankerConfig?.agent) || undefined;
  const endpointEnvironment = endpoints.create({ requestedAgent, clankerConfig, logger }).resolve();
  return {
    clankerConfig,
    clankerEnvironment: extractClankerEnvironment(clankerConfig, endpointEnvironment),
    requestedAgent,
    projectConfig: payload.projectConfig,
    overrides: payload.overrides,
    turn: turnOptionsOf(payload),
    mcpServers: payload.mcpServers ?? [],
    skills: payload.skills ?? [],
  };
}
