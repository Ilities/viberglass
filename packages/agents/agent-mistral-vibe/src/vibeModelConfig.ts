import { modelEndpointRequestHeaders } from "@viberglass/agent-core";
import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  type ModelApiFormat,
  type WorkerModelEndpoint,
} from "@viberglass/types";

const API_STYLES: Record<ModelApiFormat, string> = {
  "openai-chat": "openai",
  "openai-responses": "openai-responses",
  "anthropic-messages": "anthropic",
};

const ALIAS = "viberglass";

/** Vibe sends a key from the environment as a bearer token to OpenAI-style APIs, and as `x-api-key` to Anthropic ones. */
function sendsKeyNatively(endpoint: WorkerModelEndpoint): boolean {
  if (endpoint.apiFormat === "anthropic-messages")
    return endpoint.auth.scheme === "header" && endpoint.auth.header.toLowerCase() === "x-api-key";
  return endpoint.auth.scheme === "bearer";
}

/**
 * Vibe reads any setting from a `VIBE_*` variable, over its config files. When it can't
 * send the key its own way, the key goes into the provider's headers.
 */
export function vibeModelEndpointEnvironment(
  endpoint: WorkerModelEndpoint,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const keyFromEnvironment = sendsKeyNatively(endpoint);
  return {
    VIBE_PROVIDERS: JSON.stringify([
      {
        name: ALIAS,
        api_base: endpoint.baseUrl,
        api_style: API_STYLES[endpoint.apiFormat],
        api_key_env_var: keyFromEnvironment ? MODEL_ENDPOINT_KEY_ENV_VAR : "",
        extra_headers: keyFromEnvironment
          ? endpoint.extraHeaders
          : modelEndpointRequestHeaders(endpoint, env),
      },
    ]),
    VIBE_MODELS: JSON.stringify([
      { name: endpoint.model, provider: ALIAS, alias: ALIAS, max_context_length: 32768 },
    ]),
    VIBE_ACTIVE_MODEL: ALIAS,
    VIBE_ENABLE_TELEMETRY: "false",
    VIBE_ENABLE_UPDATE_CHECKS: "false",
    VIBE_ENABLE_AUTO_UPDATE: "false",
  };
}
