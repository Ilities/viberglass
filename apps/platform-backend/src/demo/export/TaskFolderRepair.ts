import { eachString, idValue, mapStrings, type Row } from "../bundle/jsonValues";

const MISREDACTED_FOLDER = /(?<![A-Za-z0-9])ta\[REDACTED\]/g;
const MARKER = "ta[REDACTED]";
const FALLBACK_ID_LENGTH = 8;

const containsMarker = (row: Row): boolean => {
  let found = false;
  eachString(row, (text) => {
    if (text.includes(MARKER)) found = true;
  });
  return found;
};

function lookup(map: ReadonlyMap<string, string>, key: string | null): string | null {
  return key === null ? null : (map.get(key) ?? null);
}

function ticketsBy(rows: readonly Row[], keyColumn: string): Map<string, string> {
  const tickets = new Map<string, string>();
  for (const row of rows) {
    const key = idValue(row, keyColumn);
    const ticket = idValue(row, "ticket_id");
    if (key !== null && ticket !== null) tickets.set(key, ticket);
  }
  return tickets;
}

/**
 * Older workers redacted the `sk-` inside a task's workspace folder name, so
 * captured runs read `/tmp/viberator-work/ta[REDACTED]/repo`. This puts
 * `task-<ticket id>` back, using the ticket the row's session or job belongs to.
 */
export class TaskFolderRepair {
  private constructor(
    private readonly sessionTickets: ReadonlyMap<string, string>,
    private readonly jobTickets: ReadonlyMap<string, string>,
  ) {}

  static from(tables: ReadonlyMap<string, readonly Row[]>): TaskFolderRepair {
    return new TaskFolderRepair(ticketsBy(tables.get("agent_sessions") ?? [], "id"), ticketsBy(tables.get("jobs") ?? [], "id"));
  }

  repair(table: string, rows: readonly Row[]): Row[] {
    return rows.map((row) => (containsMarker(row) ? this.repairRow(table, row) : row));
  }

  private repairRow(table: string, row: Row): Row {
    const folder = this.folderFor(table, row);
    return Object.fromEntries(
      Object.entries(row).map(([column, value]) => [column, mapStrings(value, (text) => text.replace(MISREDACTED_FOLDER, folder))]),
    );
  }

  private folderFor(table: string, row: Row): string {
    const ticket = this.ticketOf(table, row);
    if (ticket !== null) return `task-${ticket}`;
    const own = jobIdOf(table, row) ?? idValue(row, "id") ?? "unknown";
    return `task-${own.slice(0, FALLBACK_ID_LENGTH)}`;
  }

  private ticketOf(table: string, row: Row): string | null {
    const sessionId = table === "agent_sessions" ? idValue(row, "id") : (idValue(row, "session_id") ?? idValue(row, "agent_session_id"));
    return (
      idValue(row, table === "tickets" ? "id" : "ticket_id") ??
      lookup(this.sessionTickets, sessionId) ??
      lookup(this.jobTickets, jobIdOf(table, row))
    );
  }
}

function jobIdOf(table: string, row: Row): string | null {
  return table === "jobs" ? idValue(row, "id") : (idValue(row, "job_id") ?? idValue(row, "last_job_id"));
}
