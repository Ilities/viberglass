import {
  modelEndpointHeaders,
  modelEndpointModelsRequest,
  type ModelEndpoint,
} from "@viberglass/types";
import type { ModelDeploymentDAO } from "../../persistence/modelHosting/ModelDeploymentDAO";
import type { SecretService } from "../SecretService";
import { ModelEndpointServiceError } from "../errors/ModelEndpointServiceError";
import logger from "../../config/logger";

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, "status">>;

/**
 * Readies a run's endpoint as the run is dispatched: a stopped deployment fails the run
 * at once, and an endpoint that may be scaled to zero gets one request so it boots while
 * the worker starts. The worker still waits for it before the agent runs.
 */
export class ModelEndpointWaker {
  constructor(
    private readonly deployments: Pick<ModelDeploymentDAO, "getByEndpoint">,
    private readonly secrets: Pick<SecretService, "resolveSecretValues">,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async prepare(endpoint: ModelEndpoint): Promise<void> {
    if (endpoint.source === "deployment") {
      const deployment = await this.deployments.getByEndpoint(endpoint.id);
      if (deployment?.mode === "stopped")
        throw new ModelEndpointServiceError(
          "MODEL_DEPLOYMENT_STOPPED",
          `${deployment.name} is stopped. Start it or pick another endpoint.`,
          409,
        );
    }
    if (endpoint.mayColdStart) void this.wake(endpoint);
  }

  private async wake(endpoint: ModelEndpoint): Promise<void> {
    try {
      const key = endpoint.secretId
        ? (await this.secrets.resolveSecretValues([endpoint.secretId])).get(endpoint.secretId)
        : undefined;
      const models = modelEndpointModelsRequest(endpoint);
      await this.fetchFn(models.url, {
        method: "GET",
        headers: { ...models.headers, ...modelEndpointHeaders(endpoint, key) },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      // A cold endpoint often doesn't answer in time; the request has still woken it.
      logger.debug("Wake request to model endpoint did not complete", {
        endpoint: endpoint.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
