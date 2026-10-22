import {
  isContextWindow,
  isObjectRecord,
  modelEndpointModelsRequest,
  type ModelEndpointCheck,
  type ModelEndpointInput,
} from "@viberglass/types";
import type { SecretService } from "../SecretService";
import { ModelEndpointServiceError } from "../errors/ModelEndpointServiceError";
import { buildModelKeyCheckRequest } from "../setup/modelKeyCheckRequest";

/** Where model lists report a model's context length: vLLM, OpenRouter and Together, Groq, LM Studio. */
const CONTEXT_LENGTH_FIELDS = ["max_model_len", "context_length", "context_window", "max_context_length"];

function contextLengthOf(entry: Record<string, unknown>): number | undefined {
  for (const field of CONTEXT_LENGTH_FIELDS) {
    const value = entry[field];
    if (isContextWindow(value)) return value;
  }
  return undefined;
}

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
  ): Promise<ModelEndpointCheck> {
    const key = input.secretId
      ? (await this.secrets.resolveSecretValues([input.secretId])).get(
          input.secretId,
        )
      : undefined;
    const models = modelEndpointModelsRequest(input);
    let response: Pick<Response, "status" | "json">;
    try {
      response = await this.fetchFn(models.url, {
        ...buildModelKeyCheckRequest(
          { auth: input.auth, headers: { ...models.headers, ...input.extraHeaders } },
          key,
        ),
        redirect: "error",
      });
    } catch {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_UNREACHABLE",
        "Couldn't reach this endpoint. Check the URL and network access.",
        502,
      );
    }
    if ([404, 405].includes(response.status))
      return {
        models: input.models,
        contextWindows: input.contextWindows ?? {},
        discoverySupported: false,
        detail: `Nothing lists models at ${models.url} (HTTP ${response.status}).`,
      };
    if (response.status !== 200) {
      throw new ModelEndpointServiceError(
        "MODEL_ENDPOINT_REJECTED",
        `Endpoint check failed (HTTP ${response.status}). Check the key and its permissions.`,
        400,
      );
    }
    const body: unknown = await response.json().catch(() => null);
    const entries =
      isObjectRecord(body) && Array.isArray(body.data)
        ? body.data.flatMap((entry: unknown) =>
            isObjectRecord(entry) && typeof entry.id === "string" && entry.id.trim() ? [{ ...entry, id: entry.id }] : [],
          )
        : [];
    const listed = entries.map((entry) => entry.id);
    // What the server reports wins; a length someone entered stays for a model it doesn't report.
    const contextWindows: Record<string, number> = { ...(input.contextWindows ?? {}) };
    for (const entry of entries) {
      const tokens = contextLengthOf(entry);
      if (tokens) contextWindows[entry.id] = tokens;
    }
    return {
      models: Array.from(new Set(listed)),
      contextWindows,
      discoverySupported: listed.length > 0,
      ...(listed.length ? {} : { detail: `${models.url} listed no models.` }),
    };
  }
}
