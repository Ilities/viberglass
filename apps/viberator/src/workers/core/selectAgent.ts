import type { BaseAgentConfig } from "@viberglass/agent-core";
import type { Logger } from "winston";
import { normalizeAgentName } from "./workerConfig";

/** The agent a run asked for, else the worker's default, else the first one the worker has. */
export function selectAgent(availableAgents: BaseAgentConfig[], requested: string | undefined, logger: Pick<Logger, "warn">): BaseAgentConfig {
  if (availableAgents.length === 0) throw new Error("No agents available");
  const wanted = normalizeAgentName(requested || process.env.DEFAULT_AGENT);
  if (!wanted) return availableAgents[0];
  const matched = availableAgents.find((agent) => agent.name === wanted);
  if (matched) return matched;
  logger.warn("Requested agent is not configured in worker, falling back", { requestedAgent: wanted, fallbackAgent: availableAgents[0].name });
  return availableAgents[0];
}
