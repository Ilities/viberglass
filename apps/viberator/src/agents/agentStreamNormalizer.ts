/**
 * Normalizes stream-json agent output (Claude/Qwen/Kimi format) into the
 * canonical platform log format expected by agent-log-model on the frontend.
 *
 * Stream-json agents emit per-event JSON lines like:
 *   {"type":"assistant","content":[{"type":"text","text":"..."},...]}
 *   {"type":"user","content":[{"type":"tool_result","tool_use_id":"X","content":"..."}]}
 *   {"type":"result","subtype":"success","result":"..."}
 *   {"type":"system",...}
 *
 * This function maps them to the canonical format:
 *   {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
 *   {"type":"item.started","item":{"id":"X","type":"command_execution","command":"..."}}
 *   {"type":"item.completed","item":{"id":"X","type":"command_execution","output":"...","status":"completed","exit_code":0}}
 */

type ContentBlock = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractContentBlocks(data: Record<string, unknown>): ContentBlock[] | null {
  // Flat form: {"type":"assistant","content":[...]}
  if (Array.isArray(data.content)) {
    return data.content.filter(isRecord);
  }
  // Nested form: {"type":"assistant","message":{"content":[...]}}
  if (isRecord(data.message) && Array.isArray(data.message.content)) {
    return (data.message.content as unknown[]).filter(isRecord);
  }
  return null;
}

function normalizeAssistantBlocks(blocks: ContentBlock[]): string[] {
  const results: string[] = [];

  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      results.push(JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: block.text },
      }));
    } else if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) {
      results.push(JSON.stringify({
        type: "item.completed",
        item: { type: "reasoning", text: block.thinking },
      }));
    } else if (block.type === "tool_use") {
      const input = isRecord(block.input) ? block.input : {};
      const command = typeof input.command === "string" ? input.command : String(block.name ?? "");
      const item: Record<string, unknown> = { type: "command_execution", command };
      if (typeof block.id === "string") item.id = block.id;
      results.push(JSON.stringify({ type: "item.started", item }));
    }
  }

  return results;
}

function normalizeUserBlocks(blocks: ContentBlock[]): string[] {
  const results: string[] = [];

  for (const block of blocks) {
    if (block.type !== "tool_result") continue;

    const isError = Boolean(block.is_error);
    const output = typeof block.content === "string" ? block.content : "";
    const item: Record<string, unknown> = {
      type: "command_execution",
      output,
      status: isError ? "failed" : "completed",
      exit_code: isError ? 1 : 0,
    };
    if (typeof block.tool_use_id === "string") item.id = block.tool_use_id;
    results.push(JSON.stringify({ type: "item.completed", item }));
  }

  return results;
}

/**
 * Normalize a single agent stdout line.
 *
 * Returns an array of canonical log line strings:
 * - Empty array: skip this line (system events, empty events)
 * - Single-element array with the original line: not a recognized stream-json event
 * - Multiple elements: one canonical line per content block
 */
export function normalizeAgentStreamLine(line: string): string[] {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed) || typeof parsed.type !== "string") return [line];
    data = parsed;
  } catch {
    return [line]; // Not JSON — emit as-is
  }

  const eventType = data.type as string;

  if (eventType === "system") return [];

  if (eventType === "result") {
    const text = typeof data.result === "string" ? data.result.trim() : "";
    if (!text) return [];
    return [JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })];
  }

  if (eventType === "assistant") {
    const blocks = extractContentBlocks(data);
    if (!blocks) return [line];
    const normalized = normalizeAssistantBlocks(blocks);
    return normalized.length > 0 ? normalized : [];
  }

  if (eventType === "user") {
    const blocks = extractContentBlocks(data);
    if (!blocks) return [];
    return normalizeUserBlocks(blocks);
  }

  // Unknown event type (e.g. "error") — emit as-is
  return [line];
}
