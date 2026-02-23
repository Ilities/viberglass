import { isObjectRecord } from "@viberglass/types";
import type {
  AgentEndpointEnvironmentFactory,
  AgentEndpointEnvironmentFactoryInput,
} from "../core/agentEndpointEnvironmentFactory";
import { NoopAgentEndpointEnvironment } from "./NoopAgentEndpointEnvironment";
import { QwenAgentEndpointEnvironment } from "./QwenAgentEndpointEnvironment";

function normalizeAgentName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveDeploymentConfig(
  clankerConfig?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!clankerConfig) {
    return undefined;
  }

  if (isObjectRecord(clankerConfig.deploymentConfig)) {
    return clankerConfig.deploymentConfig;
  }

  return clankerConfig;
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

function resolveQwenEndpoint(
  clankerConfig?: Record<string, unknown>,
): string | undefined {
  const deploymentConfig = resolveDeploymentConfig(clankerConfig);
  if (!deploymentConfig) {
    return undefined;
  }

  const deploymentAgent = isObjectRecord(deploymentConfig.agent)
    ? deploymentConfig.agent
    : undefined;

  if (deploymentConfig.version === 1) {
    if (deploymentAgent?.type !== "qwen-cli") {
      return undefined;
    }

    return toNonEmptyString(deploymentAgent.endpoint);
  }

  const configuredAgent =
    normalizeAgentName(clankerConfig?.agent) ||
    normalizeAgentName(deploymentConfig.agent);
  if (configuredAgent !== "qwen-cli") {
    return undefined;
  }

  return (
    toNonEmptyString(deploymentConfig.qwenEndpoint) ||
    toNonEmptyString(deploymentConfig.endpoint)
  );
}

export class ClankerAgentEndpointEnvironmentFactory
  implements AgentEndpointEnvironmentFactory
{
  create(input: AgentEndpointEnvironmentFactoryInput) {
    const requestedAgent = normalizeAgentName(input.requestedAgent);
    const configAgent = resolveAgentFromConfig(input.clankerConfig);
    const defaultAgent = normalizeAgentName(process.env.DEFAULT_AGENT);
    const effectiveAgent = requestedAgent || configAgent || defaultAgent;

    if (effectiveAgent !== "qwen-cli") {
      return new NoopAgentEndpointEnvironment();
    }

    const endpoint = resolveQwenEndpoint(input.clankerConfig);
    if (!endpoint) {
      return new NoopAgentEndpointEnvironment();
    }

    return new QwenAgentEndpointEnvironment(endpoint);
  }
}
