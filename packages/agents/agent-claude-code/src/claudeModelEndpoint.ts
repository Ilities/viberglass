import { modelEndpointKey } from "@viberglass/agent-core";
import type { WorkerModelEndpoint } from "@viberglass/types";

/** Claude Code asks for a login unless some credential is set; endpoints keyed another way get this one. */
const PLACEHOLDER_TOKEN = "unused";

function headerLines(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

/**
 * Environment that points Claude Code at the endpoint's model for everything,
 * background and subagent calls included, with Anthropic-only traffic and betas off.
 */
export function claudeModelEndpointEnvironment(
  endpoint: WorkerModelEndpoint,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const headers = { ...endpoint.extraHeaders };
  let token: string | undefined;
  if (endpoint.auth.scheme === "bearer") token = modelEndpointKey(env);
  else if (endpoint.auth.scheme === "header") {
    headers[endpoint.auth.header] = modelEndpointKey(env);
    // Claude Code counts these two headers as a login; any other needs a token beside it.
    if (!["x-api-key", "authorization"].includes(endpoint.auth.header.toLowerCase())) token = PLACEHOLDER_TOKEN;
  } else token = PLACEHOLDER_TOKEN;
  const model = endpoint.model;
  return {
    ANTHROPIC_BASE_URL: endpoint.baseUrl,
    // An API key would be sent as well; unset drops it from the agent's environment.
    ANTHROPIC_API_KEY: undefined,
    ...(token ? { ANTHROPIC_AUTH_TOKEN: token } : {}),
    ...(Object.keys(headers).length ? { ANTHROPIC_CUSTOM_HEADERS: headerLines(headers) } : {}),
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    ANTHROPIC_DEFAULT_FABLE_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: model,
    CLAUDE_CODE_SUBAGENT_MODEL: model,
    CLAUDE_CODE_NO_MODEL_FALLBACK: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: "32768",
    CLAUDE_CODE_NON_INTERACTIVE: "true",
  };
}
