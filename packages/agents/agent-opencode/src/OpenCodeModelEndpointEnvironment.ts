import type { AgentEndpointEnvironment } from "@viberglass/agent-core";
import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  modelEndpointHeaders,
  modelOutputLimit,
  normalizeModelEndpointBaseUrl,
  type WorkerModelEndpoint,
} from "@viberglass/types";

export class OpenCodeModelEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    const endpoint = this.endpoint;
    const anthropic = endpoint.apiFormat === "anthropic-messages";
    const headers = modelEndpointHeaders(
      endpoint,
      `{env:${MODEL_ENDPOINT_KEY_ENV_VAR}}`,
    );
    return {
      OPENCODE_MODEL: `viberglass/${endpoint.model}`,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        model: `viberglass/${endpoint.model}`,
        small_model: `viberglass/${endpoint.model}`,
        provider: {
          viberglass: {
            npm: anthropic ? "@ai-sdk/anthropic" : "@ai-sdk/openai-compatible",
            name: endpoint.name,
            options: {
              baseURL: anthropic
                ? `${normalizeModelEndpointBaseUrl(endpoint.baseUrl, endpoint.apiFormat)}/v1`
                : endpoint.baseUrl,
              // The SDK requires a key even with custom auth headers; don't fall back to an unrelated environment key.
              ...(anthropic ? { apiKey: "" } : {}),
              headers,
            },
            // Without limits OpenCode asks for 32k output tokens, which a 32k-context server refuses outright.
            models: {
              [endpoint.model]: {
                name: endpoint.model,
                ...(endpoint.contextWindow
                  ? { limit: { context: endpoint.contextWindow, output: modelOutputLimit(endpoint.contextWindow) } }
                  : {}),
              },
            },
          },
        },
      }),
    };
  }
}
