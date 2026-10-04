# Runner configuration and execution matrix

The instance contains one configuration for every non-test provider in `packages/types/src/agentProviderCatalog.json`, plus Pi: **14 review runners, 13 catalog providers, eight harnesses**. The built-in demo adds a separate sample-data agent (15 list entries total); it is not an execution probe. The `fake` test provider is excluded from the production-provider count.

## How the matrix was populated

The single supplied credential was read from `.zai-token` and stored as encrypted database secrets in the isolated instance. No real key is present in these documents, mockups, screenshots or JSON evidence. Compatible runners use z.ai `glm-4.7-flash`. Catalog-provider names identify which app binding is represented; they do not mean a native vendor’s API was tested.

The public setup/provider picker does not offer z.ai or a custom provider. Custom harness settings and explicit secret bindings were therefore created through the application APIs. This is setup friction to fix, not a user-facing setup recipe to recommend. Google Antigravity and Mistral Vibe are configured without keys: current app configuration does not expose the required GLM-compatible path for those harnesses. Their native providers were not tested.

| Catalog provider | Harness | Review configuration | Execution coverage |
|---|---|---|---|
| Alibaba Model Studio | Qwen CLI | GLM Chat Completions endpoint; OPENAI_MODEL requested | Representative Qwen run failed with Internal error. Model override is not represented by the current Qwen config schema. |
| Alibaba Coding Plan | Qwen CLI | Same GLM setup | Binding/configuration checked; shares Qwen probe. Native plan not tested. |
| Anthropic | Claude Code | GLM Anthropic endpoint; default model aliases point to Flash | Real research, questions, answer-driven revisions and plan. Code turn reached expected local repository publication failure. |
| DeepSeek | OpenCode | Custom `zai/glm-4.7-flash`, opencode.json and explicit key aliases | Partial research produced; long-running turn cancelled. No clean successful completion claimed. |
| Google Gemini | Antigravity | No key; configuration-only | Native credentials needed; no GLM-compatible endpoint field in app. |
| Groq | OpenCode | Same custom GLM configuration | Binding/configuration checked; shares OpenCode probe. Native API not tested. |
| Kimi Code | Kimi Code | GLM base URL and model | Representative ACP run failed with Authentication required. |
| Mistral | Mistral Vibe | No key; configuration-only | Native credentials needed; current app harness settings do not expose a custom endpoint path. |
| Moonshot AI | Kimi Code | GLM base URL/model; Moonshot key alias bound | Binding/configuration checked; shares Kimi probe. Native API not tested. |
| OpenAI | Codex | API-key mode; GLM Responses base URL and model requested | ACP run failed with Authentication required; setup was not a successful authenticated session. |
| OpenCode Go | OpenCode | Same custom GLM configuration | Binding/configuration checked; shares OpenCode probe. Native subscription not tested. |
| OpenRouter | OpenCode | Same custom GLM configuration | Binding/configuration checked; shares OpenCode probe. Native API not tested. |
| xAI | OpenCode | Same custom GLM configuration | Binding/configuration checked; shares OpenCode probe. Native API not tested. |
| Custom GLM (additional) | Pi | pi/models.json, model registration and key env reference | Completed with an empty artifact. Retried after upgrading the CLI from inherited 0.99.2 to 1.x; same outcome. |

Repeated catalog bindings sharing a harness were not each charged a redundant LLM run. The actual probes are in [runner-results.json](runner-results.json). The six harnesses configured for GLM all received real task-run attempts. Native-only configurations are explicitly incomplete.

## Endpoints and provenance

A direct `glm-4.7-flash` request to `https://api.z.ai/api/paas/v4/chat/completions` returned HTTP 200 and “OK” with ten total tokens. The Anthropic-compatible runner endpoint was `https://api.z.ai/api/anthropic`; Codex’s requested Responses endpoint was `https://api.z.ai/api/v1`.

[Z.ai’s GLM documentation](https://docs.z.ai/guides/llm/glm-4.7) documents Flash and Chat Completions. [Its Claude integration guide](https://docs.z.ai/devpack/tool/claude) documents the Anthropic endpoint. [Its Codex guide](https://docs.z.ai/devpack/tool/codex) distinguishes the dedicated Responses endpoint. Compatibility of an endpoint protocol does not establish compatibility of the current Viberglass ACP adapter or account entitlement; the failed probes demonstrate that distinction.

## Important readiness distinction

Listing runners refreshed image-backed configurations to Active, including configurations with “No usable model key”. Active is therefore an image/compute availability signal in this build, not evidence that the agent can authenticate or produce an artifact. Runners must not be presented to a PM as ready based solely on that label.

Successful Claude records lacked reported modelSnapshot, harnessVersion and measured token/cost values. The requested model was Flash, but the actual model identifier was not independently reported by the app. No dollar-cost total is invented. The primary evidence is artifact output and task history, rather than the list’s Active badge.
