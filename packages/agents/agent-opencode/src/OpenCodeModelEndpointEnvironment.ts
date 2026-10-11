import type { AgentEndpointEnvironment } from "@viberglass/agent-core";
import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  modelEndpointHeaders,
  type WorkerModelEndpoint,
} from "@viberglass/types";

export class OpenCodeModelEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    const endpoint = this.endpoint;
    const headers = modelEndpointHeaders(
      endpoint,
      `{env:${MODEL_ENDPOINT_KEY_ENV_VAR}}`,
    );
    return {
      OPENCODE_MODEL: `viberglass/${endpoint.model}`,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        model: `viberglass/${endpoint.model}`,
        provider: {
          viberglass: {
            npm: "@ai-sdk/openai-compatible",
            name: endpoint.name,
            options: { baseURL: endpoint.baseUrl, headers },
            // Without limits OpenCode asks for 32k output tokens, which a 32k-context server refuses outright.
            models: {
              [endpoint.model]: {
                name: endpoint.model,
                limit: { context: 32768, output: 8192 },
              },
            },
          },
        },
      }),
    };
  }
}
