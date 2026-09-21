/**
 * GenAI semantic conventions — pinned surface.
 *
 * The GenAI conventions are still `development` stability and the attribute
 * names have churned (`gen_ai.system` → `gen_ai.provider.name`, the move to a
 * dedicated semantic-conventions repository). Instrumentation that imports
 * constants straight from `@opentelemetry/semantic-conventions/incubating`
 * therefore silently changes the shape of its spans whenever the dependency is
 * bumped, which quietly invalidates every trace recorded before the bump.
 *
 * So: the revision is pinned in one place, the attribute names we emit are
 * written out as literals here, and `semconv.test.ts` asserts each literal
 * still equals the constant the pinned package exports. Bumping the package
 * without reviewing the diff fails the test rather than rewriting history.
 *
 * Pinned against: OpenTelemetry semantic conventions v1.43.0
 * (`@opentelemetry/semantic-conventions@1.43.0`, `/incubating` entry point).
 */

/**
 * Recorded on every span we emit, so a trace can be interpreted against the
 * convention revision that produced it rather than whatever is current.
 */
export const GENAI_SEMCONV_REVISION = "1.43.0";

/** Attribute carrying {@link GENAI_SEMCONV_REVISION}. Not itself a semconv attribute. */
export const ATTR_VG_SEMCONV_REVISION = "vg.semconv.revision";

// --- GenAI attributes (development stability, v1.43.0) ----------------------

export const ATTR_GEN_AI_OPERATION_NAME = "gen_ai.operation.name";
export const ATTR_GEN_AI_PROVIDER_NAME = "gen_ai.provider.name";
export const ATTR_GEN_AI_AGENT_ID = "gen_ai.agent.id";
export const ATTR_GEN_AI_AGENT_NAME = "gen_ai.agent.name";
export const ATTR_GEN_AI_AGENT_DESCRIPTION = "gen_ai.agent.description";
export const ATTR_GEN_AI_CONVERSATION_ID = "gen_ai.conversation.id";
export const ATTR_GEN_AI_REQUEST_MODEL = "gen_ai.request.model";
export const ATTR_GEN_AI_REQUEST_MAX_TOKENS = "gen_ai.request.max_tokens";
export const ATTR_GEN_AI_RESPONSE_MODEL = "gen_ai.response.model";
export const ATTR_GEN_AI_RESPONSE_ID = "gen_ai.response.id";
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS =
  "gen_ai.response.finish_reasons";
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens";
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens";
export const ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS =
  "gen_ai.usage.reasoning.output_tokens";
export const ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS =
  "gen_ai.usage.cache_read.input_tokens";
export const ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS =
  "gen_ai.usage.cache_creation.input_tokens";
export const ATTR_GEN_AI_TOOL_NAME = "gen_ai.tool.name";
export const ATTR_GEN_AI_TOOL_TYPE = "gen_ai.tool.type";

// --- GenAI enum values (v1.43.0) -------------------------------------------

export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT = "invoke_agent";
export const GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL = "execute_tool";
export const GEN_AI_OPERATION_NAME_VALUE_CHAT = "chat";

export const GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC = "anthropic";
export const GEN_AI_PROVIDER_NAME_VALUE_OPENAI = "openai";
export const GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI = "mistral_ai";
export const GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI = "gcp.gemini";
export const GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK = "deepseek";

/**
 * Providers with no `gen_ai.provider.name` enum member at the pinned revision.
 *
 * The spec allows a free-form value, so these are emitted verbatim rather than
 * squeezed into a member that would misattribute the request. Revisit on each
 * revision bump — if upstream adds a member, switch to it.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_MOONSHOT = "moonshot";
export const GEN_AI_PROVIDER_NAME_VALUE_ALIBABA_QWEN = "alibaba.qwen";
/** Agents that are harness-configurable and whose backing provider we cannot know here. */
export const GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN = "_OTHER";

/**
 * Maps a Viberglass agent plugin id to a `gen_ai.provider.name` value.
 *
 * Deliberately conservative: an agent whose provider depends on runtime
 * configuration resolves to `_OTHER` rather than to a guess, because a wrong
 * provider label is worse than an absent one when the traces are later used as
 * an eval corpus.
 */
const AGENT_PROVIDER: Readonly<Record<string, string>> = {
  "claude-code": GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  codex: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  gemini: GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
  "mistral-vibe": GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI,
  "kimi-code": GEN_AI_PROVIDER_NAME_VALUE_MOONSHOT,
  qwen: GEN_AI_PROVIDER_NAME_VALUE_ALIBABA_QWEN,
  // opencode and pi are provider-agnostic — the backing model is chosen by
  // harness config we do not see at this layer.
  opencode: GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN,
  pi: GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN,
};

export function providerNameForAgent(agentId: string | undefined): string {
  if (!agentId) {
    return GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN;
  }
  return AGENT_PROVIDER[agentId] ?? GEN_AI_PROVIDER_NAME_VALUE_UNKNOWN;
}
