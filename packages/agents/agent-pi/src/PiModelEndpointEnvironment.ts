import type { AgentEndpointEnvironment } from "@viberglass/agent-core";
import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  type ModelApiFormat,
  type WorkerModelEndpoint,
} from "@viberglass/types";

const API_NAMES: Record<ModelApiFormat, string> = {
  "openai-chat": "openai-completions",
  "openai-responses": "openai-responses",
  "anthropic-messages": "anthropic-messages",
};

export class PiModelEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    const endpoint = this.endpoint;
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(endpoint.extraHeaders)) {
      headers[name] = value.replace(/\$/g, () => "$$").replace(/^!/, "$!");
    }
    if (endpoint.auth.scheme === "bearer")
      headers.Authorization = `Bearer $${MODEL_ENDPOINT_KEY_ENV_VAR}`;
    if (endpoint.auth.scheme === "header")
      headers[endpoint.auth.header] = `$${MODEL_ENDPOINT_KEY_ENV_VAR}`;
    return {
      PI_CUSTOM_MODELS: JSON.stringify({
        providers: {
          viberglass: {
            baseUrl: endpoint.baseUrl,
            api: API_NAMES[endpoint.apiFormat],
            // Pi requires a key to select a model; only the configured header carries the real token.
            apiKey: "anonymous",
            authHeader: false,
            headers,
            models: [
              {
                id: endpoint.model,
                name: endpoint.model,
                reasoning: false,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 32768,
                maxTokens: 8192,
              },
            ],
          },
        },
      }),
      PI_CUSTOM_MODEL: endpoint.model,
    };
  }
}
