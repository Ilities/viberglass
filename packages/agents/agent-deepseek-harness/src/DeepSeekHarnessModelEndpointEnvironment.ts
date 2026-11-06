import { MODEL_ENDPOINT_CONFIG_ENV_VAR } from "@viberglass/agent-core";
import type { AgentEndpointEnvironment } from "@viberglass/agent-core";
import { MODEL_ENDPOINT_KEY_ENV_VAR, type WorkerModelEndpoint } from "@viberglass/types";

/**
 * Points the harness at a workspace model endpoint. The endpoint's key is a
 * run credential injected after this environment is resolved, so it is left
 * for the agent to read at launch when it isn't set here already.
 */
export class DeepSeekHarnessModelEndpointEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    const endpoint = this.endpoint;
    const key = process.env[MODEL_ENDPOINT_KEY_ENV_VAR];
    return {
      [MODEL_ENDPOINT_CONFIG_ENV_VAR]: JSON.stringify(endpoint),
      DEEPSEEK_BASE_URL: endpoint.baseUrl,
      DSH_MODEL: endpoint.model,
      ...(key ? { DEEPSEEK_API_KEY: key } : {}),
    };
  }
}
