import { isObjectRecord } from "./clankerConfig";
import { SUPPORTED_AGENT_TYPES, type AgentType } from "./clanker";
import catalog from "./agentPluginCatalog.json";

export type ModelApiFormat =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages";
export type ModelEndpointAuth =
  | { scheme: "bearer" }
  | { scheme: "header"; header: string }
  | { scheme: "none" };

export interface ModelEndpointInput {
  name: string;
  baseUrl: string;
  apiFormat: ModelApiFormat;
  auth: ModelEndpointAuth;
  secretId?: string | null;
  extraHeaders: Record<string, string>;
  models: string[];
  mayColdStart: boolean;
}

export interface ModelEndpoint extends ModelEndpointInput {
  id: string;
  source: "manual" | "deployment";
  deploymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelEndpointSelection {
  endpointId: string;
  model: string;
}

export interface WorkerModelEndpoint {
  name: string;
  baseUrl: string;
  apiFormat: ModelApiFormat;
  auth: ModelEndpointAuth;
  extraHeaders: Record<string, string>;
  model: string;
  mayColdStart: boolean;
}

export const MODEL_ENDPOINT_KEY_ENV_VAR = "MODEL_ENDPOINT_API_KEY";

export function isModelApiFormat(value: unknown): value is ModelApiFormat {
  return (
    value === "openai-chat" ||
    value === "openai-responses" ||
    value === "anthropic-messages"
  );
}

export function isModelEndpointAuth(
  value: unknown,
): value is ModelEndpointAuth {
  return (
    isObjectRecord(value) &&
    (value.scheme === "none" ||
      value.scheme === "bearer" ||
      (value.scheme === "header" && typeof value.header === "string"))
  );
}

export function modelEndpointHeaders(
  endpoint: Pick<ModelEndpointInput, "auth" | "extraHeaders">,
  key?: string,
): Record<string, string> {
  const headers = { ...endpoint.extraHeaders };
  if (endpoint.auth.scheme === "none") return headers;
  if (!key) throw new Error("The model endpoint key is missing.");
  const name =
    endpoint.auth.scheme === "bearer" ? "Authorization" : endpoint.auth.header;
  for (const header of Object.keys(headers)) {
    if (header.toLowerCase() === name.toLowerCase()) delete headers[header];
  }
  headers[name] = endpoint.auth.scheme === "bearer" ? `Bearer ${key}` : key;
  return headers;
}

export function getAgentModelApiFormats(
  agent: AgentType | "",
): readonly string[] {
  const entry = catalog.find((item) => item.agent === agent);
  return entry &&
    "modelApiFormats" in entry &&
    Array.isArray(entry.modelApiFormats)
    ? entry.modelApiFormats
    : [];
}

/**
 * The harness that runs a model endpoint speaking this API format: the first
 * in the catalogue that supports it (OpenCode for Chat Completions, else Pi).
 * Null when no harness here speaks it yet.
 */
export function agentForModelApiFormat(format: ModelApiFormat): AgentType | null {
  for (const entry of catalog) {
    const formats: readonly string[] = "modelApiFormats" in entry && Array.isArray(entry.modelApiFormats) ? entry.modelApiFormats : [];
    const agent = SUPPORTED_AGENT_TYPES.find((type) => type === entry.agent);
    if (agent && agent !== "fake" && formats.includes(format)) return agent;
  }
  return null;
}

export function readWorkerModelEndpoint(
  value: unknown,
): WorkerModelEndpoint | undefined {
  if (
    !isObjectRecord(value) ||
    !isObjectRecord(value.extraHeaders) ||
    !isModelEndpointAuth(value.auth) ||
    !isModelApiFormat(value.apiFormat) ||
    typeof value.baseUrl !== "string" ||
    typeof value.name !== "string" ||
    typeof value.model !== "string" ||
    typeof value.mayColdStart !== "boolean"
  )
    return undefined;
  const extraHeaders: Record<string, string> = {};
  for (const [key, header] of Object.entries(value.extraHeaders)) {
    if (typeof header !== "string") return undefined;
    extraHeaders[key] = header;
  }
  return {
    name: value.name,
    baseUrl: value.baseUrl,
    apiFormat: value.apiFormat,
    auth: value.auth,
    extraHeaders,
    model: value.model,
    mayColdStart: value.mayColdStart,
  };
}
