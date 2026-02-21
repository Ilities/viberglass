import type { CodexAgentConfig, CodexAuthConfig, CodexAuthMode } from "@viberglass/types";
import {
  toNonEmptyString,
  toObjectRecord,
  toOptionalFiniteNumber,
} from "../parsers";

export const DEFAULT_CODEX_AUTH_MODE: CodexAuthMode = "api_key";
export const DEFAULT_CODEX_AUTH_SECRET_NAME = "CODEX_AUTH_JSON";
export const DEFAULT_CODEX_API_KEY_SECRET_NAME = "OPENAI_API_KEY";

export function normalizeCodexAuthConfig(value: unknown): CodexAuthConfig {
  const source = toObjectRecord(value) || {};

  const mode = source.mode === "chatgpt_device" ? "chatgpt_device" : DEFAULT_CODEX_AUTH_MODE;

  return {
    mode,
    secretName: toNonEmptyString(source.secretName) || DEFAULT_CODEX_AUTH_SECRET_NAME,
    apiKeySecretName: toNonEmptyString(source.apiKeySecretName) || DEFAULT_CODEX_API_KEY_SECRET_NAME,
  };
}

export function normalizeCodexAgentConfig(value: unknown): CodexAgentConfig {
  const source = toObjectRecord(value) || {};
  const cli = toObjectRecord(source.cli) || {};

  const normalized: CodexAgentConfig = {
    type: "codex",
    codexAuth: normalizeCodexAuthConfig(source.codexAuth),
  };

  const baseUrl = toNonEmptyString(cli.baseUrl);
  const model = toNonEmptyString(cli.model);
  const maxTokens = toOptionalFiniteNumber(cli.maxTokens);
  const temperature = toOptionalFiniteNumber(cli.temperature);

  if (baseUrl || model || maxTokens !== undefined || temperature !== undefined) {
    normalized.cli = {
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    };
  }

  return normalized;
}
