import type { AgentEndpointEnvironment } from "@viberglass/agent-core";
import type { WorkerModelEndpoint } from "@viberglass/types";

/**
 * Points the adapter at a model endpoint. The adapter sends its key as a bearer
 * token, so the agent supplies the endpoint's key as DEEPSEEK_API_KEY.
 */
export class DeepseekModelEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    return {
      DEEPSEEK_BASE_URL: this.endpoint.baseUrl,
      DSH_MODEL: this.endpoint.model,
    };
  }
}
