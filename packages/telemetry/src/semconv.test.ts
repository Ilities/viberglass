/**
 * Drift guard for the pinned GenAI semantic conventions.
 *
 * `semconv.ts` writes attribute names out as literals so that bumping
 * `@opentelemetry/semantic-conventions` cannot silently change the shape of
 * spans already recorded. This test is the other half of that bargain: it
 * asserts every literal still matches the pinned package. If a bump renames or
 * removes an attribute, this fails, and the decision — re-pin, migrate, or
 * emit both — gets made deliberately instead of by dependency resolution.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as incubating from "@opentelemetry/semantic-conventions/incubating";

import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_ID,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
  GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GENAI_SEMCONV_REVISION,
  providerNameForAgent,
  GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN,
} from "./semconv";

describe("pinned GenAI semantic conventions", () => {
  it("declares an exact dependency pin matching the recorded revision", () => {
    // The semantic-conventions package restricts its `exports` map, so its
    // package.json cannot be required. Asserting against our own declared
    // dependency is the check that matters anyway: the revision stamped onto
    // every span must be the version we actually resolve, and it must be
    // exact — a caret range would let the shape of spans drift on install.
    const ourPackage = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };

    expect(ourPackage.dependencies["@opentelemetry/semantic-conventions"]).toBe(
      GENAI_SEMCONV_REVISION,
    );
  });

  it.each([
    ["ATTR_GEN_AI_OPERATION_NAME", ATTR_GEN_AI_OPERATION_NAME],
    ["ATTR_GEN_AI_PROVIDER_NAME", ATTR_GEN_AI_PROVIDER_NAME],
    ["ATTR_GEN_AI_AGENT_ID", ATTR_GEN_AI_AGENT_ID],
    ["ATTR_GEN_AI_AGENT_NAME", ATTR_GEN_AI_AGENT_NAME],
    ["ATTR_GEN_AI_AGENT_DESCRIPTION", ATTR_GEN_AI_AGENT_DESCRIPTION],
    ["ATTR_GEN_AI_CONVERSATION_ID", ATTR_GEN_AI_CONVERSATION_ID],
    ["ATTR_GEN_AI_REQUEST_MODEL", ATTR_GEN_AI_REQUEST_MODEL],
    ["ATTR_GEN_AI_REQUEST_MAX_TOKENS", ATTR_GEN_AI_REQUEST_MAX_TOKENS],
    ["ATTR_GEN_AI_RESPONSE_MODEL", ATTR_GEN_AI_RESPONSE_MODEL],
    ["ATTR_GEN_AI_RESPONSE_ID", ATTR_GEN_AI_RESPONSE_ID],
    ["ATTR_GEN_AI_RESPONSE_FINISH_REASONS", ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
    ["ATTR_GEN_AI_USAGE_INPUT_TOKENS", ATTR_GEN_AI_USAGE_INPUT_TOKENS],
    ["ATTR_GEN_AI_USAGE_OUTPUT_TOKENS", ATTR_GEN_AI_USAGE_OUTPUT_TOKENS],
    [
      "ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS",
      ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
    ],
    [
      "ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS",
      ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
    ],
    [
      "ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS",
      ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
    ],
    ["ATTR_GEN_AI_TOOL_NAME", ATTR_GEN_AI_TOOL_NAME],
    ["ATTR_GEN_AI_TOOL_TYPE", ATTR_GEN_AI_TOOL_TYPE],
    ["GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT", GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT],
    ["GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL", GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL],
    ["GEN_AI_OPERATION_NAME_VALUE_CHAT", GEN_AI_OPERATION_NAME_VALUE_CHAT],
    ["GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC", GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC],
    ["GEN_AI_PROVIDER_NAME_VALUE_OPENAI", GEN_AI_PROVIDER_NAME_VALUE_OPENAI],
    ["GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI", GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI],
    ["GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI", GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI],
    ["GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK", GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK],
  ])("%s matches the pinned package", (exportName, ourValue) => {
    const upstream = (incubating as Record<string, unknown>)[exportName];
    expect(upstream).toBeDefined();
    expect(ourValue).toBe(upstream);
  });
});

describe("providerNameForAgent", () => {
  it("maps known agents to their provider", () => {
    expect(providerNameForAgent("claude-code")).toBe(
      GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
    );
    expect(providerNameForAgent("codex")).toBe(GEN_AI_PROVIDER_NAME_VALUE_OPENAI);
    expect(providerNameForAgent("gemini")).toBe(
      GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
    );
  });

  it("does not guess a provider for harness-configurable agents", () => {
    expect(providerNameForAgent("opencode")).toBe(GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN);
    expect(providerNameForAgent("pi")).toBe(GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN);
  });

  it("falls back for unregistered and missing agents", () => {
    expect(providerNameForAgent("some-future-agent")).toBe(
      GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN,
    );
    expect(providerNameForAgent(undefined)).toBe(GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN);
  });
});
