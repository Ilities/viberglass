import type {
  AgentEndpointEnvironmentFactory,
  AgentEndpointEnvironmentFactoryInput,
} from "../core/agentEndpointEnvironmentFactory";
import { NoopAgentEndpointEnvironment } from "@viberglass/agent-core";
import { agentRegistry } from "../../agents/registerPlugins";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    if (plugin?.endpointEnvironment) {
      return plugin.endpointEnvironment({
        logger: input.logger,
        workDir: "",
        clankerConfig: input.clankerConfig,
        callbackClient: undefined,
        sendProgress: async () => {},
      });
    }

    return new NoopAgentEndpointEnvironment();
  }
}
