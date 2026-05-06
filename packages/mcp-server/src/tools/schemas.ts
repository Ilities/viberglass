import { z } from "zod";

export const clankerListSchema = {
  status: z
    .enum(["active", "inactive", "deploying", "failed"])
    .optional()
    .describe("Filter by clanker status"),
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
  projectId: z.string().uuid().optional().describe("Filter by project UUID"),
  statuses: z
    .string()
    .optional()
    .describe("Comma-separated statuses: open, in_progress, in_review, resolved"),
  workflowPhases: z
    .string()
    .optional()
    .describe("Comma-separated phases: research, planning, execution"),
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
  projectId: z.string().uuid().describe("Project UUID"),
  title: z.string().min(1).max(500).describe("Ticket title"),
  description: z.string().min(1).describe("Ticket description"),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .describe("Severity level (default: medium)"),
  category: z.string().optional().describe("Ticket category"),
  ticketSystem: z.string().optional().describe("External ticket system"),
};

export const ticketGetSchema = {
  ticketId: z.string().uuid().describe("Ticket UUID"),
};

export const ticketTriggerSchema = {
  ticketId: z.string().uuid().describe("Ticket UUID"),
  clankerId: z.string().uuid().describe("Clanker (AI agent) UUID to run"),
  targetPhase: z
    .enum(["research", "planning", "execution"])
    .describe("Workflow phase to run"),
};

export const ticketReviewSchema = {
  ticketId: z.string().uuid().describe("Ticket UUID"),
};

export const ticketReviewApproveSchema = {
  ticketId: z.string().uuid().describe("Ticket UUID"),
};

export const ticketReviewRevokeSchema = {
  ticketId: z.string().uuid().describe("Ticket UUID"),
};

export const ticketReviewCommentSchema = {
  ticketId: z.string().uuid().describe("Ticket UUID"),
  phase: z
    .enum(["research", "planning"])
    .describe("Phase to comment on"),
  lineNumber: z.number().int().min(1).describe("Line number in the document"),
  content: z.string().min(1).describe("Comment text"),
};
