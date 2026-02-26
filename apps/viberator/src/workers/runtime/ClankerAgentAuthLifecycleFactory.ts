import { resolveCodexAuthSettings } from "../../config/clankerConfig";
import type {
  AgentAuthLifecycleFactory,
  AgentAuthLifecycleFactoryInput,
} from "../core/agentAuthLifecycleFactory";
import { CodexAuthManager } from "./CodexAuthManager";
import { CodexAgentAuthLifecycle } from "./CodexAgentAuthLifecycle";
import { NoopAgentAuthLifecycle } from "./NoopAgentAuthLifecycle";

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

export class ClankerAgentAuthLifecycleFactory
  implements AgentAuthLifecycleFactory
{
  create(input: AgentAuthLifecycleFactoryInput) {
    const requestedAgent = normalizeAgentName(input.requestedAgent);
    const configAgent = resolveAgentFromConfig(input.clankerConfig);
    const defaultAgent = normalizeAgentName(process.env.DEFAULT_AGENT);
    const effectiveAgent = requestedAgent || configAgent || defaultAgent;

    if (effectiveAgent !== "codex") {
      return new NoopAgentAuthLifecycle();
    }

    const codexAuthSettings = resolveCodexAuthSettings(input.clankerConfig);
    process.env.CODEX_AUTH_MODE = codexAuthSettings.mode;
    process.env.CODEX_AUTH_SECRET_NAME = codexAuthSettings.secretName;

    const codexAuthManager = new CodexAuthManager(
      input.logger,
      input.callbackClient,
      input.workDir,
      input.sendProgress,
      codexAuthSettings,
      input.credentialProvider,
    );

    return new CodexAgentAuthLifecycle({
      mode: codexAuthSettings.mode,
      materializeFromEnvironment: () =>
        codexAuthManager.materializeAuthCacheFromEnv(),
      ensureDeviceAuth: (jobId, tenantId) =>
        codexAuthManager.ensureDeviceAuth(jobId, tenantId),
      forceFreshDeviceAuth: (jobId, tenantId) =>
        codexAuthManager.forceFreshDeviceAuth(jobId, tenantId),
    });
  }
}
