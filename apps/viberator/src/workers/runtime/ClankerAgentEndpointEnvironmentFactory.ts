import { isObjectRecord, pickSettingValues, readWorkerModelEndpoint, type AgentSettingField } from "@viberglass/types";
import type {
  AgentEndpointEnvironmentFactory,
  AgentEndpointEnvironmentFactoryInput,
} from "../core/agentEndpointEnvironmentFactory";
import { NoopAgentEndpointEnvironment } from "@viberglass/agent-core";
import { agentRegistry } from "../../agents/registerPlugins";

function normalizeAgentName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveAgentFromConfig(value: unknown): string | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const directAgent = normalizeAgentName(value.agent);
  if (directAgent) {
    return directAgent;
  }

  if (isObjectRecord(value.agent)) {
    const nestedAgent = normalizeAgentName(value.agent.type);
    if (nestedAgent) {
      return nestedAgent;
    }
  }

  const deploymentConfig = isObjectRecord(value.deploymentConfig)
    ? value.deploymentConfig
    : undefined;
  if (!deploymentConfig) {
    return undefined;
  }

  const deploymentAgent = normalizeAgentName(deploymentConfig.agent);
  if (deploymentAgent) {
    return deploymentAgent;
  }

  if (isObjectRecord(deploymentConfig.agent)) {
    return normalizeAgentName(deploymentConfig.agent.type);
  }

  return undefined;
}

/** The env vars the runner's settings for this harness set. */
function settingsEnvironment(
  agent: string,
  fields: readonly AgentSettingField[],
  config: Record<string, unknown> | undefined,
): Record<string, string> {
  const agentConfig = config?.version === 1 && isObjectRecord(config.agent) ? config.agent : undefined;
  if (agentConfig?.type !== agent) return {};
  const values = pickSettingValues(fields, agentConfig);
  const env: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value) for (const name of field.env) env[name] = value;
  }
  return env;
}

export class ClankerAgentEndpointEnvironmentFactory implements AgentEndpointEnvironmentFactory {
  create(input: AgentEndpointEnvironmentFactoryInput) {
    const requestedAgent = normalizeAgentName(input.requestedAgent);
    const configAgent = resolveAgentFromConfig(input.clankerConfig);
    const defaultAgent = normalizeAgentName(process.env.DEFAULT_AGENT);
    const effectiveAgent = requestedAgent || configAgent || defaultAgent;

    if (!effectiveAgent) {
      return new NoopAgentEndpointEnvironment();
    }

    const plugin = agentRegistry().tryGet(effectiveAgent);
    const config = isObjectRecord(input.clankerConfig?.deploymentConfig) ? input.clankerConfig.deploymentConfig : input.clankerConfig;
    if (config?.resolvedModelEndpoint !== undefined) {
      const endpoint = readWorkerModelEndpoint(config.resolvedModelEndpoint);
      if (!endpoint || !plugin?.customEndpoints?.apiFormats.includes(endpoint.apiFormat)) {
        throw new Error("The runner's model endpoint is invalid or unsupported by this agent");
      }
      return plugin.customEndpoints.environment(endpoint);
    }
    const env = settingsEnvironment(effectiveAgent, plugin?.settings ?? [], config);
    return Object.keys(env).length > 0 ? { resolve: () => env } : new NoopAgentEndpointEnvironment();
  }
}
