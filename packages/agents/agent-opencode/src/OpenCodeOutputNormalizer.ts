import type { AgentOutputNormalizer } from "@viberglass/agent-core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function completed(item: Record<string, unknown>): string {
  return JSON.stringify({ type: "item.completed", item });
}

function started(item: Record<string, unknown>): string {
  return JSON.stringify({ type: "item.started", item });
}

/** What a tool call worked on, for the run log: its command, else the tool and its file, pattern or URL. */
function toolCommand(name: string, input: Record<string, unknown>): string {
  const subject =
    stringOf(input.filePath) ?? stringOf(input.file_path) ?? stringOf(input.path) ??
    stringOf(input.pattern) ?? stringOf(input.query) ?? stringOf(input.url);
  return stringOf(input.command) ?? (subject ? `${name} ${subject}` : name);
}

/** `run --format json`: one `text` or `tool_use` event per part, and `step_*` events between model calls. */
function normalizeRunEvent(type: string, part: Record<string, unknown>): string[] {
  if (type === "text") {
    const text = stringOf(part.text)?.trim();
    return text ? [completed({ type: "agent_message", text })] : [];
  }

  const state = isRecord(part.state) ? part.state : null;
  if (!state) return [];
  const status = stringOf(state.status) ?? "";
  const call: Record<string, unknown> = {
    type: "command_execution",
    command: toolCommand(stringOf(part.tool) ?? "(tool)", isRecord(state.input) ? state.input : {}),
  };
  const callId = stringOf(part.callID);
  if (callId) call.id = callId;
  if (status === "running") return [started(call)];

  const isError = status === "error" || status === "failed";
  return [
    started(call),
    completed({
      ...call,
      aggregated_output: stringOf(state.output) ?? "",
      status: isError ? "failed" : "completed",
      exit_code: isError ? 1 : 0,
    }),
  ];
}

/** `message.part.updated`, the event stream of `opencode serve`. */
function normalizePartUpdate(part: Record<string, unknown>): string[] {
  const partType = stringOf(part.type) ?? "";
  const text = stringOf(part.text)?.trim();
  if (partType === "text") return text ? [completed({ type: "agent_message", text })] : [];
  if (partType === "thinking" || partType === "reasoning") return text ? [completed({ type: "reasoning", text })] : [];
  if (partType !== "tool") return [];

  const state = stringOf(part.state) ?? "";
  const id = stringOf(part.id);
  const withId = (item: Record<string, unknown>) => (id ? { ...item, id } : item);
  if (state === "running") {
    const input = isRecord(part.input) ? part.input : {};
    return [started(withId({ type: "command_execution", command: stringOf(input.command) ?? stringOf(part.name) ?? "(tool)" }))];
  }
  const output = stringOf(part.output) ?? "";
  if (state === "complete" || state === "completed") {
    return [completed(withId({ type: "command_execution", output, status: "completed", exit_code: 0 }))];
  }
  if (state === "error") {
    return [completed(withId({ type: "command_execution", output, status: "failed", exit_code: 1 }))];
  }
  return [];
}

/** OpenCode's JSON events; any other line passes through. */
export class OpenCodeOutputNormalizer implements AgentOutputNormalizer {
  processLine(line: string): string[] {
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      return [line];
    }
    if (!isRecord(data) || typeof data.type !== "string") return [line];

    if (data.type === "step_start" || data.type === "step_finish") return [];
    const part = isRecord(data.part) ? data.part : null;
    if (data.type === "text" || data.type === "tool_use") return part ? normalizeRunEvent(data.type, part) : [];
    if (data.type === "message.part.updated") return part ? normalizePartUpdate(part) : [];
    return [line];
  }

  flush(): string[] {
    return [];
  }
}
