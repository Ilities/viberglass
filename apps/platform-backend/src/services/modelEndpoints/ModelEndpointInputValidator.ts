import type { ModelEndpointInput } from "@viberglass/types";
import type { SecretDAO } from "../../persistence/secret/SecretDAO";
import { ModelEndpointServiceError } from "../errors/ModelEndpointServiceError";

export class ModelEndpointInputValidator {
  constructor(private readonly secrets: Pick<SecretDAO, "getSecret">) {}

  async validate(input: ModelEndpointInput): Promise<void> {
    const url = new URL(input.baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_INVALID",
        "Use an HTTP or HTTPS base URL without credentials, a query or a fragment.",
      );
    }
    if (input.auth.scheme === "none" ? !!input.secretId : !input.secretId) {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_INVALID",
        "Choose a shared secret for authenticated endpoints; anonymous endpoints need no secret.",
      );
    }
    if (input.secretId) {
      const secret = await this.secrets.getSecret(input.secretId);
      if (!secret || secret.purpose)
        throw new ModelEndpointServiceError(
          "MODEL_ENDPOINT_INVALID",
          "Choose an existing API key secret.",
        );
    }
    const authName =
      input.auth.scheme === "header"
        ? input.auth.header.toLowerCase()
        : "authorization";
    const names = Object.keys(input.extraHeaders).map((name) =>
      name.toLowerCase(),
    );
    if (
      new Set(names).size !== names.length ||
      names.some((name) =>
        [authName, "authorization", "x-api-key", "api-key"].includes(name),
      )
    ) {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_INVALID",
        "Keep authentication in a shared secret. Extra header names must be unique.",
      );
    }
  }
}
