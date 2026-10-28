import type { AgentEndpointEnvironment } from "@viberglass/agent-core";
import { MODEL_ENDPOINT_KEY_ENV_VAR, modelEndpointHeaders, type WorkerModelEndpoint } from "@viberglass/types";

export class DeepseekModelEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    const endpoint = this.endpoint;
    const headers = modelEndpointHeaders(endpoint, MODEL_ENDPOINT_KEY_ENV_VAR);
    return {
      DEEPSEEK_BASE_URL: endpoint.baseUrl,
      DEEPSEEK_API_KEY: endpoint.auth.scheme === "none" ? "anonymous" : MODEL_ENDPOINT_KEY_ENV_VAR,
      DSH_MODEL: endpoint.model,
      DSH_ACP_ENDPOINT_HEADERS: JSON.stringify(headers),
    };
  }
}
