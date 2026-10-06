/** Parsing the task list's query string. */
import {
  TICKET_ARCHIVE_FILTER,
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type Severity,
  type TicketArchiveFilter,
  type TicketLifecycleStatus,
  type TicketWorkflowPhase,
} from "@viberglass/types";

export const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ticketLifecycleStatuses: TicketLifecycleStatus[] = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.IN_REVIEW,
  TICKET_STATUS.RESOLVED,
];

const ticketWorkflowPhases: TicketWorkflowPhase[] = [
  TICKET_WORKFLOW_PHASE.PLANNING,
  TICKET_WORKFLOW_PHASE.EXECUTION,
];

const ticketArchiveFilters: TicketArchiveFilter[] = [
  TICKET_ARCHIVE_FILTER.EXCLUDE,
  TICKET_ARCHIVE_FILTER.ONLY,
  TICKET_ARCHIVE_FILTER.INCLUDE,
];

export function parseStatusesQuery(
  rawStatuses: string | string[] | undefined,
): TicketLifecycleStatus[] | null {
  if (!rawStatuses) {
    return [];
  }

  const source = Array.isArray(rawStatuses)
    ? rawStatuses.join(",")
    : rawStatuses;
  const values = source
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return [];
  }

  if (
    !values.every((value) =>
      ticketLifecycleStatuses.includes(value as TicketLifecycleStatus),
    )
  ) {
    return null;
  }

  return values as TicketLifecycleStatus[];
}

export function parseArchivedQuery(
  rawArchived: string | string[] | undefined,
): TicketArchiveFilter | null {
  if (!rawArchived) {
    return TICKET_ARCHIVE_FILTER.EXCLUDE;
  }

  const value = Array.isArray(rawArchived) ? rawArchived[0] : rawArchived;
  if (!ticketArchiveFilters.includes(value as TicketArchiveFilter)) {
    return null;
  }

  return value as TicketArchiveFilter;
}

export function parseWorkflowPhasesQuery(
  rawWorkflowPhases: string | string[] | undefined,
): TicketWorkflowPhase[] | null {
  if (!rawWorkflowPhases) {
    return [];
  }

  const source = Array.isArray(rawWorkflowPhases)
    ? rawWorkflowPhases.join(",")
    : rawWorkflowPhases;
  const values = source
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return [];
  }

  if (
    !values.every((value) =>
      ticketWorkflowPhases.includes(value as TicketWorkflowPhase),
    )
  ) {
    return null;
  }

  return values as TicketWorkflowPhase[];
}

export function parseSeverityQuery(
  rawSeverity: string | string[] | undefined,
): Severity | null {
  if (!rawSeverity) {
    return null;
  }

  const value = Array.isArray(rawSeverity) ? rawSeverity[0] : rawSeverity;
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }

  return null;
}
