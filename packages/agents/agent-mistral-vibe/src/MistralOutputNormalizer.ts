import { normalizeStreamJsonLine, type AgentOutputNormalizer } from "@viberglass/agent-core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How much a line opens (+) or closes (-) JSON objects and arrays, ignoring brackets inside strings. */
function depthDelta(line: string): number {
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

/** A tool call as the run log shows it: its name and arguments. */
function toolCallCommand(name: string, argumentsJson: string): string {
  try {
    const args: unknown = JSON.parse(argumentsJson);
    if (isRecord(args)) {
      const parts = Object.entries(args)
        .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
        .join(" ");
      if (parts) return `${name} ${parts}`;
    }
  } catch {
    // The tool's name alone.
  }
  return name;
}

function normalizeMessage(message: Record<string, unknown>): string[] {
  if (message.role === "assistant") {
    const results: string[] = [];
    if (typeof message.content === "string" && message.content.trim()) {
      results.push(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: message.content.trim() } }));
    }
    for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
      if (!isRecord(call)) continue;
      const fn = isRecord(call.function) ? call.function : {};
      const name = typeof fn.name === "string" ? fn.name : "(tool)";
      const item: Record<string, unknown> = {
        type: "command_execution",
        command: toolCallCommand(name, typeof fn.arguments === "string" ? fn.arguments : "{}"),
      };
      if (typeof call.id === "string") item.id = call.id;
      results.push(JSON.stringify({ type: "item.started", item }));
    }
    return results;
  }

  if (message.role === "tool") {
    const item: Record<string, unknown> = {
      type: "command_execution",
      output: typeof message.content === "string" ? message.content : "",
      status: "completed",
      exit_code: 0,
    };
    if (typeof message.tool_call_id === "string") item.id = message.tool_call_id;
    return [JSON.stringify({ type: "item.completed", item })];
  }

  return [];
}

/**
 * Mistral Vibe prints OpenAI chat messages pretty-printed, one field per line,
 * so lines are buffered until the object closes. A complete one-line object is
 * read as stream-json.
 */
export class MistralOutputNormalizer implements AgentOutputNormalizer {
  private buffer: string[] = [];
  private depth = 0;

  processLine(line: string): string[] {
    if (this.buffer.length === 0) {
      if (!line.startsWith("{") && !line.startsWith("[")) return normalizeStreamJsonLine(line);
      try {
        JSON.parse(line);
        return normalizeStreamJsonLine(line);
      } catch {
        // The start of a pretty-printed object.
      }
    }

    this.depth += depthDelta(line);
    this.buffer.push(line);
    return this.depth <= 0 ? this.flush() : [];
  }

  flush(): string[] {
    if (this.buffer.length === 0) return [];
    const assembled = this.buffer.join("\n");
    this.buffer = [];
    this.depth = 0;
    try {
      const parsed: unknown = JSON.parse(assembled);
      return isRecord(parsed) ? normalizeMessage(parsed) : [];
    } catch {
      return [];
    }
  }
}
