import type {
  AgentAuthLifecycleFactory,
  AgentAuthLifecycleFactoryInput,
} from "../core/agentAuthLifecycleFactory";
import { NoopAgentAuthLifecycle } from "@viberglass/agent-core";
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

export class ClankerAgentAuthLifecycleFactory implements AgentAuthLifecycleFactory {
  create(input: AgentAuthLifecycleFactoryInput) {
    const requestedAgent = normalizeAgentName(input.requestedAgent);
    const configAgent = resolveAgentFromConfig(input.clankerConfig);
    const defaultAgent = normalizeAgentName(process.env.DEFAULT_AGENT);
    const effectiveAgent = requestedAgent || configAgent || defaultAgent;

    if (!effectiveAgent) {
      return new NoopAgentAuthLifecycle();
    }

    const plugin = agentRegistry().tryGet(effectiveAgent);
    if (plugin?.authLifecycle) {
      return plugin.authLifecycle({
        logger: input.logger,
        workDir: input.workDir,
        clankerConfig: input.clankerConfig,
        callbackClient: input.callbackClient,
        credentialProvider: input.credentialProvider,
        sendProgress: input.sendProgress,
      });
    }

    return new NoopAgentAuthLifecycle();
  }
}
