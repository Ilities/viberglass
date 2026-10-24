import type { AgentEndpointEnvironment } from "@viberglass/agent-core";
import type { WorkerModelEndpoint } from "@viberglass/types";

/** Points the harness at a workspace's custom model endpoint. The endpoint's key reaches the adapter as MODEL_ENDPOINT_API_KEY. */
export class DeepSeekModelEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    return {
      DEEPSEEK_BASE_URL: this.endpoint.baseUrl,
      DSH_MODEL: this.endpoint.model,
    };
  }
}
