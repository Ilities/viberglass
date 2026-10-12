import type { AgentOutputNormalizer } from "./agentOutputNormalizer";

type ContentBlock = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractContentBlocks(data: Record<string, unknown>): ContentBlock[] | null {
  if (Array.isArray(data.content)) {
    return data.content.filter(isRecord);
  }
  if (isRecord(data.message) && Array.isArray(data.message.content)) {
    return data.message.content.filter(isRecord);
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

/** One line of Claude Code's `stream-json`; any other line passes through. */
export function normalizeStreamJsonLine(line: string): string[] {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed) || typeof parsed.type !== "string") return [line];
    data = parsed;
  } catch {
    return [line];
  }

  if (data.type === "system") return [];

  if (data.type === "result") {
    const text = typeof data.result === "string" ? data.result.trim() : "";
    if (!text) return [];
    return [JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })];
  }

  if (data.type === "assistant") {
    const blocks = extractContentBlocks(data);
    if (!blocks) return [line];
    return normalizeAssistantBlocks(blocks);
  }

  if (data.type === "user") {
    const blocks = extractContentBlocks(data);
    if (!blocks) return [];
    return normalizeUserBlocks(blocks);
  }

  return [line];
}

/**
 * Claude Code's `stream-json`, which Qwen and Kimi write too. Codex already
 * writes `item.*` events, which pass through. The default for every harness.
 */
export class StreamJsonNormalizer implements AgentOutputNormalizer {
  processLine(line: string): string[] {
    return normalizeStreamJsonLine(line);
  }

  flush(): string[] {
    return [];
  }
}
