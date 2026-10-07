import * as fs from "fs";
import * as path from "path";
import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  type ModelApiFormat,
  type WorkerModelEndpoint,
} from "@viberglass/types";

const PROTOCOLS: Record<ModelApiFormat, string> = {
  "openai-chat": "openai",
  "openai-responses": "openai-responses",
  "anthropic-messages": "anthropic",
};

/** Qwen won't start a provider without a key, so endpoints keyed another way get this one. */
export const QWEN_PLACEHOLDER_KEY_ENV_VAR = "QWEN_PLACEHOLDER_API_KEY";

/**
 * Qwen settings that run the endpoint's model. Qwen expands `$VARS` in its settings
 * files, so the key stays in the environment.
 */
export function qwenModelSettings(endpoint: WorkerModelEndpoint): Record<string, unknown> {
  const protocol = PROTOCOLS[endpoint.apiFormat];
  const headers: Record<string, string> = { ...endpoint.extraHeaders };
  if (endpoint.auth.scheme === "header")
    headers[endpoint.auth.header] = `$${MODEL_ENDPOINT_KEY_ENV_VAR}`;
  return {
    security: { auth: { selectedType: protocol } },
    model: { name: endpoint.model },
    privacy: { usageStatisticsEnabled: false },
    modelProviders: {
      [protocol]: [
        {
          id: endpoint.model,
          baseUrl: endpoint.baseUrl,
          envKey:
            endpoint.auth.scheme === "bearer"
              ? MODEL_ENDPOINT_KEY_ENV_VAR
              : QWEN_PLACEHOLDER_KEY_ENV_VAR,
          generationConfig: { contextWindowSize: 32768, customHeaders: headers },
        },
      ],
    },
  };
}

/**
 * Writes the settings as Qwen's system settings, which outrank the user's, in the run's
 * own config directory rather than in `~/.qwen`, which persists between runs.
 */
export function writeQwenModelSettings(endpoint: WorkerModelEndpoint, configDir: string): string {
  fs.mkdirSync(configDir, { recursive: true });
  const file = path.join(configDir, "settings.json");
  fs.writeFileSync(file, JSON.stringify(qwenModelSettings(endpoint)), { mode: 0o600 });
  return file;
}
