import { resolveCodexAuthSettings } from "../../config/clankerConfig";
import type {
  AgentAuthLifecycleFactory,
  AgentAuthLifecycleFactoryInput,
} from "../core/agentAuthLifecycleFactory";
import { CodexAuthManager } from "./CodexAuthManager";
import { CodexAgentAuthLifecycle } from "./CodexAgentAuthLifecycle";
import { NoopAgentAuthLifecycle } from "./NoopAgentAuthLifecycle";

function normalizeAgentName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ClankerAgentAuthLifecycleFactory
  implements AgentAuthLifecycleFactory
{
  create(input: AgentAuthLifecycleFactoryInput) {
    const requestedAgent = normalizeAgentName(input.requestedAgent);
    const configAgent = normalizeAgentName(input.clankerConfig?.agent);
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
