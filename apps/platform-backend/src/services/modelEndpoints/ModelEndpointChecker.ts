import { isObjectRecord, type ModelEndpointInput } from "@viberglass/types";
import type { SecretService } from "../SecretService";
import { ModelEndpointServiceError } from "../errors/ModelEndpointServiceError";
import { buildModelKeyCheckRequest } from "../setup/modelKeyCheckRequest";

type Fetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "json">>;

export class ModelEndpointChecker {
  constructor(
    private readonly secrets: Pick<SecretService, "resolveSecretValues">,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async check(
    input: ModelEndpointInput,
  ): Promise<{ models: string[]; discoverySupported: boolean }> {
    const key = input.secretId
      ? (await this.secrets.resolveSecretValues([input.secretId])).get(
          input.secretId,
        )
      : undefined;
    let response: Pick<Response, "status" | "json">;
    try {
      response = await this.fetchFn(
        `${input.baseUrl.replace(/\/+$/, "")}/models`,
        {
          ...buildModelKeyCheckRequest(
            { auth: input.auth, headers: input.extraHeaders },
            key,
          ),
          redirect: "error",
        },
      );
    } catch {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_UNREACHABLE",
        "Couldn't reach this endpoint. Check the URL and network access.",
        502,
      );
    }
    if ([404, 405].includes(response.status))
      return { models: input.models, discoverySupported: false };
    if (response.status !== 200) {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_REJECTED",
        `Endpoint check failed (HTTP ${response.status}). Check the key and its permissions.`,
        400,
      );
    }
    const body: unknown = await response.json().catch(() => null);
    const models =
      isObjectRecord(body) && Array.isArray(body.data)
        ? body.data.flatMap((entry: unknown) =>
            isObjectRecord(entry) &&
            typeof entry.id === "string" &&
            entry.id.trim()
              ? [entry.id]
              : [],
          )
        : [];
    return {
      models: Array.from(new Set(models)),
      discoverySupported: models.length > 0,
    };
  }
}
