/**
 * Maps ACP wire-protocol notifications to the platform's session event shapes.
 *
 * Reference: ACP ↔ Platform Session Concept Mapping
 *   agent_message_chunk  → assistant_message
 *   tool_call_update     → tool_call_started / tool_call_completed
 *   plan                 → needs_approval
 *   session/request_permission → needs_approval
 *   natural question     → needs_input (heuristic via detectsNeedsInput)
 */

export interface PlatformSessionEvent {
  eventType: string;
  payload: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mapToolCallUpdate(params: Record<string, unknown>): PlatformSessionEvent[] {
  const state = typeof params.state === "string" ? params.state : "";
  const toolName = typeof params.name === "string" ? params.name : "";
  const toolCallId = typeof params.id === "string" ? params.id : undefined;

  if (state === "started" || state === "running") {
    const input = isRecord(params.input) ? params.input : {};
    return [{ eventType: "tool_call_started", payload: { toolName, toolCallId, input } }];
  }

  if (state === "completed" || state === "done") {
    const output = typeof params.output === "string" ? params.output : "";
    return [{ eventType: "tool_call_completed", payload: { toolName, toolCallId, output, success: true } }];
  }

  if (state === "failed" || state === "error") {
    const error = typeof params.error === "string" ? params.error : "";
    return [{ eventType: "tool_call_completed", payload: { toolName, toolCallId, error, success: false } }];
  }

  return [];
}

/**
 * Maps a session/update notification params to zero or more platform events.
 *
 * The params.type field selects the update subtype per the ACP spec:
 *   agent_message_chunk, tool_call_update, plan,
 *   user_message_chunk, session_info_update
 */
export function mapSessionUpdate(params: unknown): PlatformSessionEvent[] {
  if (!isRecord(params)) return [];

  const updateType = typeof params.type === "string" ? params.type : "";

  switch (updateType) {
    case "agent_message_chunk": {
      const text = typeof params.text === "string" ? params.text : "";
      if (!text) return [];
      return [{ eventType: "assistant_message", payload: { text } }];
    }

    case "tool_call_update":
      return mapToolCallUpdate(params);

    case "plan": {
      const content = typeof params.content === "string" ? params.content : "";
      return [{
        eventType: "needs_approval",
        payload: { requestType: "approval", promptMarkdown: content },
      }];
    }

    case "user_message_chunk":
    case "session_info_update":
      return [];

    default:
      return [];
  }
}

/**
 * Maps a session/request_permission request from the CLI to a needs_approval
 * platform event. The ACP permission request carries structured options
 * (allow_once, allow_always, reject_once, reject_always).
 */
export function mapPermissionRequest(params: unknown): PlatformSessionEvent {
  const prompt =
    isRecord(params) && typeof params.prompt === "string"
      ? params.prompt
      : "Agent is requesting permission to continue.";

  return {
    eventType: "needs_approval",
    payload: {
      requestType: "permission",
      promptMarkdown: prompt,
      options: ["allow_once", "allow_always", "reject_once", "reject_always"],
    },
  };
}

/**
 * Heuristic: returns true when the last assistant message appears to be an
 * open question requiring user input. Used to emit a needs_input event when
 * the turn ends without an explicit session/request_permission.
 */
export function detectsNeedsInput(lastAssistantText: string): boolean {
  const trimmed = lastAssistantText.trimEnd();
  return trimmed.length > 0 && trimmed.endsWith("?");
}
