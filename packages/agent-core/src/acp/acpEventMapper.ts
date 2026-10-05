/**
 * Maps ACP wire-protocol notifications to the platform's session event shapes.
 *
 * Reference: ACP ↔ Platform Session Concept Mapping
 *   agent_message_chunk  → assistant_message
 *   tool_call_update     → tool_call_started / tool_call_completed
 *   plan                 → needs_approval
 *   session/request_permission → needs_approval
 */

import type { PlatformSessionEvent } from "./types";
import type { AcpEventMapper } from "./acpEventMapperTypes";

export type { PlatformSessionEvent } from "./types";
export type { AcpEventMapper } from "./acpEventMapperTypes";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Tool output kept on an event; a read can return a whole file, which the transcript doesn't need. */
const MAX_TOOL_OUTPUT_CHARS = 4000;

function truncated(text: string): string {
  return text.length > MAX_TOOL_OUTPUT_CHARS ? `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}…` : text;
}

/** ACP's rawOutput is the harness's own shape: OpenCode sends `{ output, metadata }`, others a string. */
function outputOf(params: Record<string, unknown>): string {
  const raw = params.rawOutput ?? params.output;
  if (typeof raw === "string") return truncated(raw);
  if (isRecord(raw) && typeof raw.output === "string") return truncated(raw.output);
  return "";
}

/** The files a tool call touches, as ACP's `locations` name them. */
function locationsOf(params: Record<string, unknown>): string[] {
  if (!Array.isArray(params.locations)) return [];
  return params.locations.flatMap((location) => (isRecord(location) && typeof location.path === "string" ? [location.path] : []));
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
  const kind = typeof params.kind === "string" ? params.kind : undefined;

  // A harness can announce a call before it has its input (OpenCode sends `pending` with an empty one)
  // and fill it in with `in_progress`; each is reported, and the transcript keeps the latest per call.
  if (state === "started" || state === "running" || state === "pending" || state === "in_progress") {
    const input = isRecord(params.rawInput) ? params.rawInput : isRecord(params.input) ? params.input : {};
    return [{ eventType: "tool_call_started", payload: { toolName, toolCallId, kind, input, locations: locationsOf(params) } }];
  }

  if (state === "completed" || state === "done") {
    return [{ eventType: "tool_call_completed", payload: { toolName, toolCallId, output: outputOf(params), success: true } }];
  }

  if (state === "failed" || state === "error") {
    const error =
      typeof params.error === "string" ? params.error :
      isRecord(params.rawOutput) && typeof params.rawOutput.error === "string" ? params.rawOutput.error : "";
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
  // ACP names the tool call being asked about in toolCall.title.
  const toolCall = isRecord(params) && isRecord(params.toolCall) ? params.toolCall : undefined;
  const prompt =
    typeof toolCall?.title === "string"
      ? toolCall.title
      : "Agent requested permission (auto-approved).";

  return {
    eventType: "progress",
    payload: { text: `Permission auto-approved: ${prompt}` },
  };
}

export const defaultAcpEventMapper: AcpEventMapper = {
  mapSessionUpdate,
  mapPermissionRequest,
};
