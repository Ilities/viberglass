import type { AgentEndpointEnvironment } from "@viberglass/agent-core";
import { MODEL_ENDPOINT_KEY_ENV_VAR, type WorkerModelEndpoint } from "@viberglass/types";

/**
 * DEEPSEEK_BASE_URL points the harness at any OpenAI-compatible endpoint and
 * DSH_MODEL names the endpoint's model. dsh sends only its standard bearer
 * key, so an endpoint that authenticates some other way runs without one.
 */
export class DeepSeekHarnessModelEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    const endpoint = this.endpoint;
    const env: Record<string, string> = {
      DEEPSEEK_BASE_URL: endpoint.baseUrl,
      DSH_MODEL: endpoint.model,
    };
    const key = process.env[MODEL_ENDPOINT_KEY_ENV_VAR];
    if (endpoint.auth.scheme === "bearer" && key) {
      env.DEEPSEEK_API_KEY = key;
    }
    return env;
  }
}
