import * as fs from "fs";
import * as path from "path";
import { modelEndpointRequestHeaders, tomlInlineTable, tomlString } from "@viberglass/agent-core";
import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  type ModelApiFormat,
  type WorkerModelEndpoint,
} from "@viberglass/types";

const PROVIDER_TYPES: Record<ModelApiFormat, string> = {
  "openai-chat": "openai",
  "openai-responses": "openai_responses",
  "anthropic-messages": "anthropic",
};

/** Kimi sends a key from the environment as a bearer token to OpenAI-style APIs, and as `x-api-key` to Anthropic ones. */
function sendsKeyNatively(endpoint: WorkerModelEndpoint): boolean {
  if (endpoint.apiFormat === "anthropic-messages")
    return endpoint.auth.scheme === "header" && endpoint.auth.header.toLowerCase() === "x-api-key";
  return endpoint.auth.scheme === "bearer";
}

/**
 * Kimi config that runs the endpoint's model. When Kimi can't send the key its own way,
 * the key is written into the provider's headers, so the file must stay private.
 */
export function kimiModelConfig(
  endpoint: WorkerModelEndpoint,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const native = sendsKeyNatively(endpoint);
  return [
    `default_model = "viberglass"`,
    `telemetry = false`,
    ``,
    `[providers.viberglass]`,
    `type = ${tomlString(PROVIDER_TYPES[endpoint.apiFormat])}`,
    `base_url = ${tomlString(endpoint.baseUrl)}`,
    native ? `api_key_env = ${tomlString(MODEL_ENDPOINT_KEY_ENV_VAR)}` : `api_key = "unused"`,
    `custom_headers = ${tomlInlineTable(native ? endpoint.extraHeaders : modelEndpointRequestHeaders(endpoint, env))}`,
    ``,
    `[models.viberglass]`,
    `provider = "viberglass"`,
    `model = ${tomlString(endpoint.model)}`,
    `max_context_size = 32768`,
    ``,
  ].join("\n");
}

/** Kimi has no separate config path, so this replaces `~/.kimi-code/config.toml`, which runs never keep. */
export function writeKimiModelConfig(endpoint: WorkerModelEndpoint, homeDir: string): void {
  const dir = path.join(homeDir, ".kimi-code");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.toml"), kimiModelConfig(endpoint), { mode: 0o600 });
}
