/**
 * Agent session domain types shared across packages and extensions.
 */

export const AGENT_SESSION_MODE = {
  RESEARCH: "research",
  PLANNING: "planning",
  EXECUTION: "execution",
} as const;

export type AgentSessionMode =
  (typeof AGENT_SESSION_MODE)[keyof typeof AGENT_SESSION_MODE];

export const AGENT_SESSION_STATUS = {
  ACTIVE: "active",
  WAITING_ON_USER: "waiting_on_user",
  WAITING_ON_APPROVAL: "waiting_on_approval",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type AgentSessionStatus =
  (typeof AGENT_SESSION_STATUS)[keyof typeof AGENT_SESSION_STATUS];
