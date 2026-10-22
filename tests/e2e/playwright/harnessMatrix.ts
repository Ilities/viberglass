/** A harness the suite runs, on its worker image, against the mock model. */
export interface HarnessUnderTest {
  agent: string;
  name: string;
  apiFormat: "openai-chat" | "openai-responses" | "anthropic-messages";
  /** Built from infra/workers/docker/generated/<dockerfile>.Dockerfile, as `viberator-worker-<agent>:e2e`. */
  dockerfile: string;
}

export const HARNESSES: HarnessUnderTest[] = [
  { agent: "opencode", name: "OpenCode", apiFormat: "openai-chat", dockerfile: "opencode" },
];

export function harnessImage(harness: HarnessUnderTest): string {
  return `viberator-worker-${harness.agent}:e2e`;
}
