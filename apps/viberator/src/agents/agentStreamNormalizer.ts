/**
 * Normalizes agent stdout into the canonical platform log format expected by
 * agent-log-model on the frontend.
 *
 * Supports two agent output formats:
 *
 * 1. JSONL / stream-json (Claude Code, Qwen, Kimi, Codex, OpenCode):
 *    One complete JSON object per line.
 *    {"type":"assistant","content":[{"type":"text","text":"..."},...]}
 *    {"type":"user","content":[{"type":"tool_result","tool_use_id":"X","content":"..."}]}
 *    {"type":"result","subtype":"success","result":"..."}
 *    {"type":"message.part.updated","part":{...}}
 *
 * 2. Pretty-printed OpenAI message objects (Mistral Vibe):
 *    One JSON field per line — multiple lines form a single message object.
 *    {"role":"assistant","content":"...","tool_calls":[...]}
 *    {"role":"tool","tool_call_id":"X","content":"..."}
 *
 * Both formats are mapped to the canonical format:
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
 * Track JSON nesting depth from a single line, correctly ignoring braces
 * inside string literals.
 */
function countDepthDelta(line: string): number {
  let delta = 0;
  let inString = false;
  let escaped = false;

  for (const ch of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{" || ch === "[") delta++;
      else if (ch === "}" || ch === "]") delta--;
    }
  }

  return delta;
}

/**
 * Normalize an assembled, multi-line OpenAI-style message object (Mistral Vibe format).
 */
function normalizeOpenAIMessage(parsed: Record<string, unknown>): string[] {
  const role = typeof parsed.role === "string" ? parsed.role : "";

  if (role === "assistant") {
    const results: string[] = [];

    // Text content
    if (typeof parsed.content === "string" && parsed.content.trim()) {
      results.push(JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: parsed.content.trim() },
      }));
    }

    // OpenAI-style tool_calls array
    if (Array.isArray(parsed.tool_calls)) {
      for (const tc of parsed.tool_calls) {
        if (!isRecord(tc)) continue;
        const id = typeof tc.id === "string" ? tc.id : undefined;
        const fn = isRecord(tc.function) ? tc.function : {};
        const name = typeof fn.name === "string" ? fn.name : "(tool)";
        const argsStr = typeof fn.arguments === "string" ? fn.arguments : "{}";

        // Build a human-readable command string from the arguments
        let command = name;
        try {
          const args: unknown = JSON.parse(argsStr);
          if (isRecord(args)) {
            const parts = Object.entries(args)
              .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
              .join(" ");
            if (parts) command = `${name} ${parts}`;
          }
        } catch {
          // Use tool name only
        }

        const item: Record<string, unknown> = { type: "command_execution", command };
        if (id) item.id = id;
        results.push(JSON.stringify({ type: "item.started", item }));
      }
    }

    return results;
  }

  if (role === "tool") {
    const id = typeof parsed.tool_call_id === "string" ? parsed.tool_call_id : undefined;
    const content = typeof parsed.content === "string" ? parsed.content : "";
    const item: Record<string, unknown> = {
      type: "command_execution",
      output: content,
      status: "completed",
      exit_code: 0,
    };
    if (id) item.id = id;
    return [JSON.stringify({ type: "item.completed", item })];
  }

  // Ignore system/user/other roles
  return [];
}

/**
 * Normalize a single JSONL line (stateless, for JSONL / stream-json formats).
 */
function normalizeJsonlLine(line: string): string[] {
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

  // New OpenCode format: step_start / step_finish carry no user-visible value
  if (eventType === "step_start" || eventType === "step_finish") return [];

  // New OpenCode format: {"type":"text","part":{"type":"text","text":"..."}}
  if (eventType === "text") {
    const part = isRecord(data.part) ? data.part : null;
    if (!part) return [];
    const text = typeof part.text === "string" ? part.text.trim() : "";
    if (!text) return [];
    return [JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })];
  }

  // New OpenCode format: {"type":"tool_use","part":{"tool":"...","callID":"...","state":{...}}}
  if (eventType === "tool_use") {
    const part = isRecord(data.part) ? data.part : null;
    if (!part) return [];

    const name = typeof part.tool === "string" ? part.tool : "(tool)";
    const callId = typeof part.callID === "string" ? part.callID : undefined;
    const state = isRecord(part.state) ? part.state : null;
    if (!state) return [];

    const status = typeof state.status === "string" ? state.status : "";
    const input = isRecord(state.input) ? state.input : {};

    // Build a human-readable command string from the tool name and input
    const cmd = typeof input.command === "string" ? input.command : null;
    const filePath =
      typeof input.filePath === "string" ? input.filePath :
      typeof input.file_path === "string" ? input.file_path :
      typeof input.path === "string" ? input.path : null;
    const pattern =
      typeof input.pattern === "string" ? input.pattern :
      typeof input.query === "string" ? input.query : null;
    const url = typeof input.url === "string" ? input.url : null;
    let command = cmd ?? (filePath ? `${name} ${filePath}` : pattern ? `${name} ${pattern}` : url ? `${name} ${url}` : name);

    const startedItem: Record<string, unknown> = { type: "command_execution", command };
    if (callId) startedItem.id = callId;

    if (status === "running") {
      return [JSON.stringify({ type: "item.started", item: startedItem })];
    }

    const isError = status === "error" || status === "failed";
    const rawOutput = state.output;
    const output = typeof rawOutput === "string" ? rawOutput : "";
    const completedItem: Record<string, unknown> = {
      ...startedItem,
      aggregated_output: output,
      status: isError ? "failed" : "completed",
      exit_code: isError ? 1 : 0,
    };

    // Emit started + completed so the frontend can pair them by id
    return [
      JSON.stringify({ type: "item.started", item: startedItem }),
      JSON.stringify({ type: "item.completed", item: completedItem }),
    ];
  }

  // Old OpenCode format: {"type":"message.part.updated","part":{...}}
  if (eventType === "message.part.updated") {
    const part = isRecord(data.part) ? data.part : null;
    if (!part) return [];
    const partType = typeof part.type === "string" ? part.type : "";

    if (partType === "text") {
      const text = typeof part.text === "string" ? part.text.trim() : "";
      if (!text) return [];
      return [JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })];
    }

    if (partType === "thinking" || partType === "reasoning") {
      const text = typeof part.text === "string" ? part.text.trim() : "";
      if (!text) return [];
      return [JSON.stringify({ type: "item.completed", item: { type: "reasoning", text } })];
    }

    if (partType === "tool") {
      const name = typeof part.name === "string" ? part.name : "(tool)";
      const state = typeof part.state === "string" ? part.state : "";
      const id = typeof part.id === "string" ? part.id : undefined;

      if (state === "running") {
        const input = isRecord(part.input) ? part.input : {};
        const command = typeof input.command === "string" ? input.command : name;
        const item: Record<string, unknown> = { type: "command_execution", command };
        if (id) item.id = id;
        return [JSON.stringify({ type: "item.started", item })];
      }

      if (state === "complete" || state === "completed") {
        const output = typeof part.output === "string" ? part.output : "";
        const item: Record<string, unknown> = { type: "command_execution", output, status: "completed", exit_code: 0 };
        if (id) item.id = id;
        return [JSON.stringify({ type: "item.completed", item })];
      }

      if (state === "error") {
        const output = typeof part.output === "string" ? part.output : "";
        const item: Record<string, unknown> = { type: "command_execution", output, status: "failed", exit_code: 1 };
        if (id) item.id = id;
        return [JSON.stringify({ type: "item.completed", item })];
      }

      return [];
    }

    return [];
  }

  // Unknown event type — emit as-is
  return [line];
}

/**
 * Stateful normalizer that handles both JSONL (one JSON object per line) and
 * pretty-printed JSON (Mistral Vibe — multiple lines form a single object).
 *
 * Create one instance per agent execution to avoid state leakage.
 */
export class AgentStreamNormalizer {
  private buffer: string[] = [];
  private depth = 0;

  /**
   * Process a single stdout line. Returns zero or more canonical log lines.
   */
  processLine(line: string): string[] {
    // Not currently buffering a multi-line object
    if (this.depth === 0 && this.buffer.length === 0) {
      if (line.startsWith("{") || line.startsWith("[")) {
        // Try to parse as a complete JSON object (JSONL case)
        try {
          const parsed: unknown = JSON.parse(line);
          if (isRecord(parsed)) {
            return normalizeJsonlLine(line);
          }
        } catch {
          // Incomplete JSON: start buffering (Mistral pretty-printed case)
          this.depth = countDepthDelta(line);
          this.buffer.push(line);
          return [];
        }
      }
      // Plain text line — use JSONL normalizer (which returns it as-is)
      return normalizeJsonlLine(line);
    }

    // Currently buffering a multi-line JSON object
    this.depth += countDepthDelta(line);
    this.buffer.push(line);

    if (this.depth <= 0) {
      return this.flushBuffer();
    }

    return [];
  }

  /**
   * Flush any remaining buffered lines. Call after the process exits to ensure
   * a partially-assembled object is not silently dropped.
   */
  flush(): string[] {
    if (this.buffer.length === 0) return [];
    return this.flushBuffer();
  }

  private flushBuffer(): string[] {
    const assembled = this.buffer.join("\n");
    this.buffer = [];
    this.depth = 0;

    try {
      const parsed: unknown = JSON.parse(assembled);
      if (isRecord(parsed)) {
        return normalizeOpenAIMessage(parsed);
      }
    } catch {
      // Assembled text is not valid JSON — drop it silently
    }

    return [];
  }
}

/**
 * Convenience stateless wrapper for a single JSONL line.
 * Kept for backwards-compatibility; prefer AgentStreamNormalizer for new code.
 */
export function normalizeAgentStreamLine(line: string): string[] {
  return normalizeJsonlLine(line);
}
