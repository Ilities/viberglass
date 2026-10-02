import type { Selectable } from "kysely";
import {
  isTicketOrigin,
  NATIVE_TICKET_ORIGIN,
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type MediaAsset,
  type Ticket,
  type TicketLifecycleStatus,
  type TicketOrigin,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import { buildMediaContentUrl } from "../../services/ticket-media/publicApiUrl";
import type { Database } from "../types/database";

export type TicketsRow = Selectable<Database["tickets"]>;

// Normalize legacy ticket_system values (2 was the old GitHub enum value)
function normalizeTicketSystem(value: unknown): TicketOrigin {
  if (value === 2) return "github";
  if (isTicketOrigin(value)) return value;
  return NATIVE_TICKET_ORIGIN;
}

function normalizeTicketStatus(value: unknown): TicketLifecycleStatus {
  if (
    value === TICKET_STATUS.OPEN ||
    value === TICKET_STATUS.IN_PROGRESS ||
    value === TICKET_STATUS.IN_REVIEW ||
    value === TICKET_STATUS.RESOLVED
  ) {
    return value;
  }
  return TICKET_STATUS.OPEN;
}

export function normalizeWorkflowPhase(value: unknown): TicketWorkflowPhase {
  if (
    value === TICKET_WORKFLOW_PHASE.RESEARCH ||
    value === TICKET_WORKFLOW_PHASE.PLANNING ||
    value === TICKET_WORKFLOW_PHASE.EXECUTION
  ) {
    return value;
  }

  return TICKET_WORKFLOW_PHASE.EXECUTION;
}

export function toISOString(date: unknown): string {
  if (date instanceof Date) return date.toISOString();
  if (typeof date === "string") return date;
  return String(date);
}

/** A task as the API returns it, from its row and the media columns joined to it. */
export function ticketOfRow(row: TicketsRow & Record<string, unknown>): Ticket {
  let screenshot: MediaAsset | undefined;
  if (row.screenshot_id) {
    screenshot = {
      id: String(row.screenshot_id),
      filename: String(row.screenshot_filename),
      mimeType: String(row.screenshot_mime_type),
      size: Number(row.screenshot_size),
      url: buildMediaContentUrl(String(row.screenshot_id)),
      storageUrl: String(row.screenshot_url),
      uploadedAt: toISOString(row.screenshot_uploaded_at),
    };
  }

  let recording: MediaAsset | undefined;
  if (row.recording_id) {
    recording = {
      id: String(row.recording_id),
      filename: String(row.recording_filename),
      mimeType: String(row.recording_mime_type),
      size: Number(row.recording_size),
      url: buildMediaContentUrl(String(row.recording_id)),
      storageUrl: String(row.recording_url),
      uploadedAt: toISOString(row.recording_uploaded_at),
    };
  }

  return {
    id: row.id,
    key: row.task_key,
    projectId: row.project_id,
    timestamp: toISOString(row.timestamp),
    title: row.title,
    description: row.description,
    severity: row.severity,
    category: row.category,
    metadata:
      typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : row.metadata,
    screenshot,
    recording,
    annotations:
      typeof row.annotations === "string"
        ? JSON.parse(row.annotations)
        : row.annotations,
    externalTicketId: row.external_ticket_id ?? undefined,
    externalTicketUrl: row.external_ticket_url ?? undefined,
    ticketSystem: normalizeTicketSystem(row.ticket_system),
    autoFixRequested: row.auto_fix_requested,
    autoFixStatus: row.auto_fix_status ?? undefined,
    status: normalizeTicketStatus(row.ticket_status),
    workflowPhase: normalizeWorkflowPhase(row.workflow_phase),
    archivedAt: row.archived_at ? toISOString(row.archived_at) : undefined,
    pullRequestUrl: row.pull_request_url ?? undefined,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at),
  };
}
