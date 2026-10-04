import {
  DEFAULT_AGENT_TYPE,
  getAgentModelApiFormats,
  isSupportedAgentType,
  type AgentType,
  type ModelEndpoint,
  type ModelEndpointInput,
  type ModelEndpointSelection,
} from "@viberglass/types";
import type { ModelEndpointDAO } from "../../persistence/modelEndpoint/ModelEndpointDAO";
import type { ModelEndpointInputValidator } from "./ModelEndpointInputValidator";
import { ModelEndpointServiceError } from "../errors/ModelEndpointServiceError";

export class ModelEndpointService {
  constructor(
    private readonly endpoints: ModelEndpointDAO,
    private readonly validator: Pick<ModelEndpointInputValidator, "validate">,
  ) {}

  list(): Promise<ModelEndpoint[]> {
    return this.endpoints.list();
  }

  async require(id: string): Promise<ModelEndpoint> {
    const endpoint = await this.endpoints.get(id);
    if (!endpoint)
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_NOT_FOUND",
        "Model endpoint not found",
        404,
      );
    return endpoint;
  }

  validate(input: ModelEndpointInput): Promise<void> {
    return this.validator.validate(input);
  }

  async assertSecretRemovable(secretId: string): Promise<void> {
    const endpoints = (await this.endpoints.list()).filter(
      (endpoint) => endpoint.secretId === secretId,
    );
    if (endpoints.length)
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_IN_USE",
        `Remove this secret from these endpoints first: ${endpoints.map((endpoint) => endpoint.name).join(", ")}.`,
        409,
      );
  }

  async create(input: ModelEndpointInput): Promise<ModelEndpoint> {
    await this.validate(input);
    await this.assertNameAvailable(input.name);
    if (!input.models.length)
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_INVALID",
        "Discover models or enter at least one model ID.",
      );
    return this.endpoints.create(input);
  }

  async update(id: string, input: ModelEndpointInput): Promise<ModelEndpoint> {
    this.assertManual(await this.require(id));
    await this.validate(input);
    await this.assertNameAvailable(input.name, id);
    if (!input.models.length)
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_INVALID",
        "Enter at least one model ID.",
      );
    const runners = await this.endpoints.runnersUsing(id);
    if (
      runners.some(
        (runner) =>
          !input.models.includes(runner.model) ||
          runner.agent === null ||
          !isSupportedAgentType(runner.agent) ||
          !getAgentModelApiFormats(runner.agent).includes(input.apiFormat),
      )
    ) {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_IN_USE",
        "This change would invalidate a runner's model or API format. Update the runners first.",
        409,
      );
    }
    const updated = await this.endpoints.update(id, input);
    if (!updated)
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_NOT_FOUND",
        "Model endpoint not found",
        404,
      );
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.assertManual(await this.require(id));
    const runners = await this.endpoints.runnersUsing(id);
    if (runners.length)
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_IN_USE",
        `Remove the endpoint from these runners first: ${runners.map((r) => r.name).join(", ")}.`,
        409,
      );
    await this.endpoints.delete(id);
  }

  async validateSelection(
    selection: ModelEndpointSelection | null | undefined,
    agent?: AgentType | null,
  ): Promise<void> {
    if (!selection) return;
    const endpoint = await this.require(selection.endpointId);
    if (
      !getAgentModelApiFormats(agent ?? DEFAULT_AGENT_TYPE).includes(
        endpoint.apiFormat,
      )
    ) {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_UNSUPPORTED",
        "This agent does not support the endpoint's API format.",
      );
    }
    if (!endpoint.models.includes(selection.model))
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_INVALID",
        "Choose a model offered by this endpoint.",
      );
  }

  private async assertNameAvailable(
    name: string,
    exceptId?: string,
  ): Promise<void> {
    if (
      (await this.endpoints.list()).some(
        (endpoint) => endpoint.name === name && endpoint.id !== exceptId,
      )
    ) {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_NAME_TAKEN",
        "An endpoint with this name already exists.",
        409,
      );
    }
  }

  private assertManual(endpoint: ModelEndpoint): void {
    if (endpoint.source !== "manual")
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_READ_ONLY",
        "Manage this endpoint through its deployment.",
        409,
      );
  }
}
