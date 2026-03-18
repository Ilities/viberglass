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

import type { PlatformSessionEvent } from "./types";
export type { PlatformSessionEvent } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mapToolCallUpdate(params: Record<string, unknown>): PlatformSessionEvent[] {
  // ACP SDK uses: toolCallId, status, title, kind, rawInput (for tool_call)
  //               toolCallId, status, content, rawOutput (for tool_call_update)
  // Legacy: state, name, id, input, output
  const status = typeof params.status === "string" ? params.status : "";
  const state = typeof params.state === "string" ? params.state : status;
  const toolCallId =
    typeof params.toolCallId === "string" ? params.toolCallId :
    typeof params.id === "string" ? params.id : undefined;
  const toolName =
    typeof params.title === "string" ? params.title :
    typeof params.name === "string" ? params.name :
    (isRecord(params._meta) && typeof (params._meta as Record<string, unknown>).toolName === "string"
      ? (params._meta as Record<string, unknown>).toolName as string : "");

  if (state === "started" || state === "running" || state === "pending") {
    const input = isRecord(params.rawInput) ? params.rawInput : isRecord(params.input) ? params.input : {};
    return [{ eventType: "tool_call_started", payload: { toolName, toolCallId, input } }];
  }

  if (state === "completed" || state === "done") {
    const output = typeof params.rawOutput === "string" ? params.rawOutput : typeof params.output === "string" ? params.output : "";
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

  // ACP SDK structure: params.update.sessionUpdate + params.update.content
  // Fallback to params.type for other implementations.
  const update = isRecord(params.update) ? params.update : params;
  const updateType =
    typeof update.sessionUpdate === "string" ? update.sessionUpdate :
    typeof update.type === "string" ? update.type : "";

  // Content payload lives in update.content (ACP SDK) or directly in update
  const content = isRecord(update.content) ? update.content : update;

  switch (updateType) {
    case "agent_message_chunk": {
      const text = typeof content.text === "string" ? content.text : "";
      if (!text) return [];
      return [{ eventType: "assistant_message", payload: { text } }];
    }

    case "agent_thought_chunk": {
      const text = typeof content.text === "string" ? content.text : "";
      if (!text) return [];
      return [{ eventType: "reasoning", payload: { text } }];
    }

    case "tool_call":
    case "tool_call_update":
      return mapToolCallUpdate(update as Record<string, unknown>);

    case "plan": {
      const text = typeof content.content === "string" ? content.content :
        typeof content.text === "string" ? content.text : "";
      return [{
        eventType: "progress",
        payload: { text: text || "Agent generated a plan." },
      }];
    }

    case "user_message_chunk":
    case "available_commands_update":
    case "current_mode_update":
    case "config_option_update":
      return [];

    default:
      return [];
  }
}

/**
 * Maps a session/request_permission request from the CLI to an informational
 * progress event. Permission requests are auto-approved by the AcpClient so
 * this is logged for visibility only.
 */
export function mapPermissionRequest(params: unknown): PlatformSessionEvent {
  const prompt =
    isRecord(params) && typeof params.prompt === "string"
      ? params.prompt
      : "Agent requested permission (auto-approved).";

  return {
    eventType: "progress",
    payload: { text: `Permission auto-approved: ${prompt}` },
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
