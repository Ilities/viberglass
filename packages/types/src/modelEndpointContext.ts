/**
 * The context length a model on a local endpoint is taken to have when nobody
 * said: what small local servers and our own deployments run. A remote
 * endpoint's unknown model gets none, and the harness uses its own default.
 */
export const LOCAL_MODEL_CONTEXT_WINDOW = 32768;

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function isLocalIPv6(host: string): boolean {
  const address = host.replace(/^\[|\]$/g, "").toLowerCase();
  return address === "::1" || /^f[cd][0-9a-f]{2}:/.test(address) || /^fe80:/.test(address);
}

/**
 * Whether the endpoint runs on this machine or its private network: loopback,
 * private addresses, Docker's host name, `.local` and `.internal` names, and
 * single-label service names such as `ollama`.
 */
export function isLocalModelEndpoint(baseUrl: string): boolean {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isPrivateIPv4(host) || isLocalIPv6(host)) return true;
  return !host.includes(".") && !host.includes(":") && !host.startsWith("[");
}

/** The endpoint form's model list: one model per line, with its context length after it when known. */
export function formatModelLines(models: readonly string[], contextWindows: Record<string, number> = {}): string {
  return models.map((model) => (contextWindows[model] ? `${model} ${contextWindows[model]}` : model)).join("\n");
}

/** Reads the endpoint form's model list: "model-id" or "model-id 131072" per line. */
export function readModelLines(text: string): { models: string[]; contextWindows: Record<string, number> } {
  const models: string[] = [];
  const contextWindows: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const match = /^(.+?)(?:\s+([\d_,]+))?$/.exec(line.trim());
    if (!match) continue;
    const [, model, size] = match;
    if (!models.includes(model)) models.push(model);
    const tokens = size ? Number(size.replace(/[_,]/g, "")) : NaN;
    if (Number.isInteger(tokens) && tokens > 0) contextWindows[model] = tokens;
  }
  return { models, contextWindows };
}

/** The context length a vLLM deployment serves, from `--max-model-len` in its serving arguments. */
export function maxModelLenOf(servingArgs: readonly string[]): number | undefined {
  for (let index = 0; index < servingArgs.length; index++) {
    const arg = servingArgs[index];
    const value = arg === "--max-model-len" ? servingArgs[index + 1] : arg.startsWith("--max-model-len=") ? arg.slice(16) : undefined;
    const tokens = Number(value);
    if (Number.isInteger(tokens) && tokens > 0) return tokens;
  }
  return undefined;
}

/** A model's context length on an endpoint: the one known for it, else the local default for a local endpoint. */
export function modelContextWindow(
  endpoint: { baseUrl: string; contextWindows?: Record<string, number> },
  model: string,
): number | undefined {
  return endpoint.contextWindows?.[model] ?? (isLocalModelEndpoint(endpoint.baseUrl) ? LOCAL_MODEL_CONTEXT_WINDOW : undefined);
}

/** Most of the window is left for the conversation: a quarter of it for one reply, at most 32,000 tokens. */
export function modelOutputLimit(contextWindow: number): number {
  return Math.min(Math.floor(contextWindow / 4), 32_000);
}
