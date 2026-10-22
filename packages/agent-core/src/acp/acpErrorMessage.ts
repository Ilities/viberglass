function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detailOf(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (!isRecord(data)) return undefined;
  if (typeof data.details === "string") return data.details;
  if (typeof data.message === "string") return data.message;
  return undefined;
}

/**
 * A JSON-RPC error as one line. ACP servers built on the ACP SDK report every
 * failure as "Internal error" and put the cause, such as the model provider's
 * rejection, in `data`.
 */
export function acpErrorMessage(error: unknown): string {
  if (!isRecord(error)) return "ACP error";
  const message = typeof error.message === "string" ? error.message : "ACP error";
  const detail = detailOf(error.data)?.trim();
  return detail && !message.includes(detail) ? `${message}: ${detail}` : message;
}
