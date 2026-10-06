import {
  MODEL_ENDPOINT_KEY_ENV_VAR,
  type Clanker,
  type SecretBinding,
  type WorkerModelEndpoint,
} from "@viberglass/types";
import type { ModelEndpointService } from "./ModelEndpointService";
import type { ModelEndpointWaker } from "./ModelEndpointWaker";

export class RunnerModelEndpointResolver {
  constructor(
    private readonly endpoints: Pick<
      ModelEndpointService,
      "require" | "validateSelection"
    >,
    private readonly waker?: Pick<ModelEndpointWaker, "prepare">,
  ) {}

  async resolve(
    clanker: Pick<Clanker, "modelEndpoint" | "agent">,
  ): Promise<{
    endpoint?: WorkerModelEndpoint;
    secretBindings: SecretBinding[];
  }> {
    if (!clanker.modelEndpoint) return { secretBindings: [] };
    await this.endpoints.validateSelection(
      clanker.modelEndpoint,
      clanker.agent,
    );
    const endpoint = await this.endpoints.require(
      clanker.modelEndpoint.endpointId,
    );
    await this.waker?.prepare(endpoint);
    return {
      endpoint: {
        name: endpoint.name,
        baseUrl: endpoint.baseUrl,
        apiFormat: endpoint.apiFormat,
        auth: endpoint.auth,
        extraHeaders: endpoint.extraHeaders,
        model: clanker.modelEndpoint.model,
        mayColdStart: endpoint.mayColdStart,
      },
      secretBindings: endpoint.secretId
        ? [{ envVar: MODEL_ENDPOINT_KEY_ENV_VAR, secretId: endpoint.secretId }]
        : [],
    };
  }
}
