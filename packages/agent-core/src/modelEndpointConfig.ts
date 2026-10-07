import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  modelEndpointHeaders,
  readWorkerModelEndpoint,
  type WorkerModelEndpoint,
} from "@viberglass/types";
import type { AgentEndpointEnvironment } from "./agentEndpointEnvironment";

/** Carries a runner's model endpoint to the agent, which writes its harness's own config from it at launch. */
export const MODEL_ENDPOINT_CONFIG_ENV_VAR = "MODEL_ENDPOINT_CONFIG";

export class ModelEndpointConfigEnvironment implements AgentEndpointEnvironment {
  constructor(private readonly endpoint: WorkerModelEndpoint) {}

  resolve(): Record<string, string> {
    return { [MODEL_ENDPOINT_CONFIG_ENV_VAR]: JSON.stringify(this.endpoint) };
  }
}

/** The run's model endpoint, or undefined when the runner uses its harness's own provider. */
export function currentModelEndpoint(
  env: NodeJS.ProcessEnv = process.env,
): WorkerModelEndpoint | undefined {
  const value = env[MODEL_ENDPOINT_CONFIG_ENV_VAR];
  if (!value) return undefined;
  const endpoint = readWorkerModelEndpoint(JSON.parse(value));
  if (!endpoint) throw new Error("Invalid model endpoint configuration");
  return endpoint;
}

/** The endpoint's key, for harnesses that can't read it from the environment themselves. */
export function modelEndpointKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env[MODEL_ENDPOINT_KEY_ENV_VAR];
  if (!key) throw new Error("The model endpoint key is missing.");
  return key;
}

/**
 * The headers a request to the endpoint carries, with the key's value in place, for
 * harnesses that can't send a key from the environment in the endpoint's way.
 */
export function modelEndpointRequestHeaders(
  endpoint: WorkerModelEndpoint,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return modelEndpointHeaders(endpoint, endpoint.auth.scheme === "none" ? undefined : modelEndpointKey(env));
}
