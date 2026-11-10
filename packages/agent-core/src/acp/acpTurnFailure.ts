/**
 * ACP has no way for a harness to say a turn failed: codex-acp ends a turn the
 * model provider refused (a 429, an outage) with `end_turn` and shows the
 * error as the agent's text. Through the JetBrains AIR extension a client can
 * ask for the failure instead; the harness then puts it in the prompt result's
 * `_meta.jetbrains.air.sessionFailure`.
 */

const AIR_EXTENSION_VERSION = 1;
const SESSION_FAILURE = "sessionFailure";

/** The `_meta` of the client capabilities that asks for failed turns to be reported. */
export const TURN_FAILURE_CAPABILITY_META = {
  jetbrains: { air: { version: AIR_EXTENSION_VERSION, capabilities: [SESSION_FAILURE] } },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The error a prompt's turn ended with, when the harness reported it as failed; retry warnings aren't failures. */
export function turnFailureOf(promptResult: unknown): string | undefined {
  const meta = isRecord(promptResult) && isRecord(promptResult._meta) ? promptResult._meta : null;
  const jetbrains = meta && isRecord(meta.jetbrains) ? meta.jetbrains : null;
  const air = jetbrains && isRecord(jetbrains.air) ? jetbrains.air : null;
  const failure = air && isRecord(air[SESSION_FAILURE]) ? air[SESSION_FAILURE] : null;
  if (!failure || failure.severity !== "error") return undefined;
  return typeof failure.title === "string" && failure.title.trim() ? failure.title.trim() : "The agent's turn failed";
}
