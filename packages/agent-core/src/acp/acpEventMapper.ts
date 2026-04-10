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
import type { AcpEventMapper } from "./acpEventMapperTypes";

export type { PlatformSessionEvent } from "./types";
export type { AcpEventMapper } from "./acpEventMapperTypes";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mapToolCallUpdate(params: Record<string, unknown>): PlatformSessionEvent[] {
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

function mapSessionUpdate(params: unknown): PlatformSessionEvent[] {
  if (!isRecord(params)) return [];

  const update = isRecord(params.update) ? params.update : params;
  const updateType =
    typeof update.sessionUpdate === "string" ? update.sessionUpdate :
    typeof update.type === "string" ? update.type : "";

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

function mapPermissionRequest(params: unknown): PlatformSessionEvent {
  const prompt =
    isRecord(params) && typeof params.prompt === "string"
      ? params.prompt
      : "Agent requested permission (auto-approved).";

  return {
    eventType: "progress",
    payload: { text: `Permission auto-approved: ${prompt}` },
  };
}

function detectsNeedsInput(lastAssistantText: string): boolean {
  const trimmed = lastAssistantText.trimEnd();
  return trimmed.length > 0 && trimmed.endsWith("?");
}

export const defaultAcpEventMapper: AcpEventMapper = {
  mapSessionUpdate,
  mapPermissionRequest,
  detectsNeedsInput,
};
