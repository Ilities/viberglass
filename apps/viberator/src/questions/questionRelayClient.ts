import type { AskHumanInput } from "./askHumanTool";

/** How the MCP server finds the worker's relay; the harness passes these to it. */
export const QUESTION_RELAY_ENV = {
  url: "VIBERGLASS_QUESTION_RELAY_URL",
  secret: "VIBERGLASS_QUESTION_RELAY_SECRET",
} as const;

export const QUESTION_RELAY_SECRET_HEADER = "x-question-relay-secret";

/** Sends the question to the relay and returns what to tell the agent. */
export async function postToRelay(relayUrl: string, secret: string, input: AskHumanInput): Promise<string> {
  if (!relayUrl) throw new Error("no question relay");
  const response = await fetch(relayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", [QUESTION_RELAY_SECRET_HEADER]: secret },
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);
  const text = typeof body === "object" && body !== null && "text" in body && typeof body.text === "string" ? body.text : null;
  if (!response.ok || text === null) {
    const error = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : response.statusText;
    throw new Error(error);
  }
  return text;
}
