import { z } from "zod";

export const clankerListSchema = {
  status: z
    .enum(["active", "inactive", "deploying", "failed"])
    .optional()
    .describe("Filter by agent status"),
  limit: z
    .number()
    .min(1)
    .max(200)
    .optional()
    .describe("Max results (default 50)"),
  offset: z.number().min(0).optional().describe("Pagination offset"),
};

export const projectListSchema = {
  limit: z
    .number()
    .min(1)
    .max(200)
    .optional()
    .describe("Max results (default 50)"),
  offset: z.number().min(0).optional().describe("Pagination offset"),
};

export const ticketListSchema = {
  spaceId: z.string().uuid().optional().describe("Filter by space UUID"),
  statuses: z
    .string()
    .optional()
    .describe("Comma-separated statuses: open, in_progress, in_review, resolved"),
  workflowPhases: z
    .string()
    .optional()
    .describe("Comma-separated phases: planning, execution"),
  severity: z
    .string()
    .optional()
    .describe("Filter by severity: low, medium, high, critical"),
  search: z.string().optional().describe("Search in title and description"),
  limit: z
    .number()
    .min(1)
    .max(200)
    .optional()
    .describe("Max results (default 50)"),
  offset: z.number().min(0).optional().describe("Pagination offset"),
};

export const ticketCreateSchema = {
  spaceId: z.string().uuid().describe("Space UUID"),
  title: z.string().min(1).max(500).describe("Task title"),
  description: z.string().min(1).describe("Task description"),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .describe("Severity level (default: medium)"),
  category: z.string().optional().describe("Task category"),
  ticketSystem: z.string().optional().describe("External tracker the task comes from"),
};

export const ticketGetSchema = {
  taskId: z.string().uuid().describe("Task UUID"),
};

export const ticketBranchSchema = {
  task: z.string().min(1).describe("The task's key (WEB-42) or UUID"),
};

export const ticketTriggerSchema = {
  taskId: z.string().uuid().describe("Task UUID"),
  agentId: z.string().uuid().describe("UUID of the agent to run, from agent_list"),
  targetPhase: z
    .enum(["planning", "execution"])
    .describe("Workflow phase to run"),
};

export const ticketReviewSchema = {
  taskId: z.string().uuid().describe("Task UUID"),
};

export const ticketReviewCommentSchema = {
  taskId: z.string().uuid().describe("Task UUID"),
  phase: z
    .enum(["planning"])
    .describe("Phase to comment on"),
  lineNumber: z.number().int().min(1).describe("Line number in the document"),
  content: z.string().min(1).describe("Comment text"),
};
