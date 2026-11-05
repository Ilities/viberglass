import { APP_MANIFEST_FILE, NATIVE_TICKET_ORIGIN, type CreateTicketRequest } from "@viberglass/types";
import type { AskInput } from "../taskTurns/TaskTurnService";

export const CONTRACT_TASK_TITLE = "Make this repository a Viberglass app";

const DESCRIPTION = [
  `This repository was brought into Viberglass as an app, and it doesn't have a ${APP_MANIFEST_FILE} yet.`,
  "Make it follow the app contract with as few changes as possible: keep its stack where you can, add the manifest, listen on $PORT, answer the health check, and keep its data in the SQLite database at APP_DATABASE_PATH.",
  "Nothing goes live until this change is made live.",
].join("\n\n");

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The task that asks the space's default agent to make an existing repository follow the app contract. */
export class AppContractTask {
  constructor(
    private readonly tickets: { createTicket(request: CreateTicketRequest): Promise<{ id: string }> },
    private readonly turns: { ask(taskId: string, actorId: string, input: AskInput): Promise<unknown> },
  ) {}

  /** The task is created even when the agent can't start on it; the warning says why. */
  async open(projectId: string, requesterId: string): Promise<{ taskId: string; warning: string | null }> {
    const ticket = await this.tickets.createTicket({
      projectId,
      title: CONTRACT_TASK_TITLE,
      description: DESCRIPTION,
      severity: "medium",
      category: "app",
      metadata: { timestamp: new Date().toISOString(), timezone: "UTC" },
      annotations: [],
      autoFixRequested: false,
      ticketSystem: NATIVE_TICKET_ORIGIN,
      requesterId,
    });
    try {
      await this.turns.ask(ticket.id, requesterId, { message: DESCRIPTION, action: "code" });
      return { taskId: ticket.id, warning: null };
    } catch (error) {
      return { taskId: ticket.id, warning: `The task "${CONTRACT_TASK_TITLE}" is there, but the agent couldn't start on it: ${message(error)}` };
    }
  }
}
