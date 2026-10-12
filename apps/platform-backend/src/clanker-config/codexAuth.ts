import type { CodexAuthConfig, CodexAuthMode } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord } from "./parsers";

export const DEFAULT_CODEX_AUTH_MODE: CodexAuthMode = "api_key";
export const DEFAULT_CODEX_AUTH_SECRET_NAME = "CODEX_AUTH_JSON";
export const DEFAULT_CODEX_API_KEY_SECRET_NAME = "OPENAI_API_KEY";

export function normalizeCodexAuthConfig(value: unknown): CodexAuthConfig {
  const source = toObjectRecord(value) || {};

  const mode =
    source.mode === "chatgpt_device" || source.mode === "chatgpt_device_stored"
      ? source.mode
      : DEFAULT_CODEX_AUTH_MODE;

  const loginSecretId = toNonEmptyString(source.loginSecretId);
  return {
    mode,
    secretName: DEFAULT_CODEX_AUTH_SECRET_NAME,
    apiKeySecretName:
      toNonEmptyString(source.apiKeySecretName) ||
      DEFAULT_CODEX_API_KEY_SECRET_NAME,
    ...(loginSecretId ? { loginSecretId } : {}),
  };
}
