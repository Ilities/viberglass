/** The steps of the harness script, one test each. */
export type HarnessStep = "plan" | "continue" | "question" | "code" | "cancel" | "rejected-key";

/** A harness the suite runs, on its worker image, against the mock model. */
export interface HarnessUnderTest {
  agent: string;
  name: string;
  apiFormat: "openai-chat" | "openai-responses" | "anthropic-messages";
  /** Built from infra/workers/docker/generated/<dockerfile>.Dockerfile, as `viberator-worker-<dockerfile>:e2e`. */
  dockerfile: string;
  /** Steps that fail today, and why; they run as expected failures, so a fix shows up as an unexpected pass. */
  knownFailures?: Partial<Record<HarnessStep, string>>;
}

export const HARNESSES: HarnessUnderTest[] = [
  { agent: "opencode", name: "OpenCode", apiFormat: "openai-chat", dockerfile: "opencode" },
  { agent: "pi", name: "Pi", apiFormat: "openai-chat", dockerfile: "pi" },
  { agent: "qwen-cli", name: "Qwen Code", apiFormat: "openai-chat", dockerfile: "qwen" },
  { agent: "kimi-code", name: "Kimi Code", apiFormat: "openai-chat", dockerfile: "kimi" },
  { agent: "mistral-vibe", name: "Mistral Vibe", apiFormat: "openai-chat", dockerfile: "mistral" },
  { agent: "claude-code", name: "Claude Code", apiFormat: "anthropic-messages", dockerfile: "claude" },
  { agent: "codex", name: "Codex", apiFormat: "openai-responses", dockerfile: "codex" },
  { agent: "deepseek-harness", name: "DeepSeek Harness", apiFormat: "openai-chat", dockerfile: "deepseek-harness" },
];

export function harnessImage(harness: HarnessUnderTest): string {
  return `viberator-worker-${harness.dockerfile}:e2e`;
}
