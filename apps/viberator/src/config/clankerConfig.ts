import { isObjectRecord } from "@viberglass/types";

export type CodexAuthMode = "api_key" | "chatgpt_device";

export interface CodexAuthSettings {
  mode: CodexAuthMode;
  secretName: string;
  apiKeySecretName: string;
}

export const DEFAULT_CODEX_AUTH_SETTINGS: CodexAuthSettings = {
  mode: "api_key",
  secretName: "CODEX_AUTH_JSON",
  apiKeySecretName: "OPENAI_API_KEY",
};

function getString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCodexAuth(raw: unknown): CodexAuthSettings {
  const source = isObjectRecord(raw) ? raw : {};
  const mode = source.mode === "chatgpt_device" ? "chatgpt_device" : "api_key";

  return {
    mode,
    secretName: DEFAULT_CODEX_AUTH_SETTINGS.secretName,
    apiKeySecretName:
      getString(source.apiKeySecretName) || DEFAULT_CODEX_AUTH_SETTINGS.apiKeySecretName,
  };
}

export function resolveCodexAuthSettings(
  clankerConfig?: Record<string, unknown>,
): CodexAuthSettings {
  const deploymentConfig = isObjectRecord(clankerConfig?.deploymentConfig)
    ? clankerConfig.deploymentConfig
    : undefined;
  if (!deploymentConfig) {
    return { ...DEFAULT_CODEX_AUTH_SETTINGS };
  }

  // V1 config envelope
  const agent = isObjectRecord(deploymentConfig.agent)
    ? deploymentConfig.agent
    : undefined;
  if (deploymentConfig.version === 1 && agent?.type === "codex") {
    return normalizeCodexAuth(agent.codexAuth);
  }

  // Legacy config format
  return normalizeCodexAuth(deploymentConfig.codexAuth);
}
