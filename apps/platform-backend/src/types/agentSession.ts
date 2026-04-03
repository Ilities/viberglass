// AgentSessionMode and AgentSessionStatus are the shared source of truth — defined in @viberglass/types
export {
  AGENT_SESSION_MODE,
  AGENT_SESSION_STATUS,
  type AgentSessionMode,
  type AgentSessionStatus,
} from "@viberglass/types";

import {
  AGENT_SESSION_STATUS,
  type AgentSessionStatus,
} from "@viberglass/types";

export const AGENT_SESSION_ACTIVE_STATUSES: readonly AgentSessionStatus[] = [
  AGENT_SESSION_STATUS.ACTIVE,
  AGENT_SESSION_STATUS.WAITING_ON_USER,
  AGENT_SESSION_STATUS.WAITING_ON_APPROVAL,
];

export const AGENT_TURN_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;

export type AgentTurnRole =
  (typeof AGENT_TURN_ROLE)[keyof typeof AGENT_TURN_ROLE];

export const AGENT_TURN_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  BLOCKED: "blocked",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type AgentTurnStatus =
  (typeof AGENT_TURN_STATUS)[keyof typeof AGENT_TURN_STATUS];

export const AGENT_SESSION_EVENT_TYPE = {
  SESSION_STARTED: "session_started",
  TURN_STARTED: "turn_started",
  USER_MESSAGE: "user_message",
  ASSISTANT_MESSAGE: "assistant_message",
  PROGRESS: "progress",
  REASONING: "reasoning",
  TOOL_CALL_STARTED: "tool_call_started",
  TOOL_CALL_COMPLETED: "tool_call_completed",
  NEEDS_INPUT: "needs_input",
  NEEDS_APPROVAL: "needs_approval",
  APPROVAL_RESOLVED: "approval_resolved",
  ARTIFACT_UPDATED: "artifact_updated",
  TURN_COMPLETED: "turn_completed",
  TURN_FAILED: "turn_failed",
  SESSION_COMPLETED: "session_completed",
  SESSION_FAILED: "session_failed",
  SESSION_CANCELLED: "session_cancelled",
} as const;

export type AgentSessionEventType =
  (typeof AGENT_SESSION_EVENT_TYPE)[keyof typeof AGENT_SESSION_EVENT_TYPE];

export const AGENT_PENDING_REQUEST_TYPE = {
  INPUT: "input",
  APPROVAL: "approval",
} as const;

export type AgentPendingRequestType =
  (typeof AGENT_PENDING_REQUEST_TYPE)[keyof typeof AGENT_PENDING_REQUEST_TYPE];

export const AGENT_PENDING_REQUEST_STATUS = {
  OPEN: "open",
  RESOLVED: "resolved",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export type AgentPendingRequestStatus =
  (typeof AGENT_PENDING_REQUEST_STATUS)[keyof typeof AGENT_PENDING_REQUEST_STATUS];
