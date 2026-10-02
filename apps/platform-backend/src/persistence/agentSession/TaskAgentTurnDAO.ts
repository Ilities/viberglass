import { isTaskTurnAction, type TaskTurnAction, type TaskTurnOutcome } from "@viberglass/types";
import db from "../config/database";
import type { AgentTurnStatus } from "../../types/agentSession";
import { outcomeOf } from "./turnOutcomeJson";

export interface TaskAgentTurn {
  id: string;
  sessionId: string;
  agent: { id: string; name: string };
  action: TaskTurnAction;
  status: AgentTurnStatus;
  outcome: TaskTurnOutcome | null;
  jobId: string | null;
  createdAt: Date;
}

/** The agents' turns on a task, for its thread. */
export class TaskAgentTurnDAO {
  async listForTask(ticketId: string): Promise<TaskAgentTurn[]> {
    const rows = await db
      .selectFrom("agent_turns")
      .innerJoin("agent_sessions", "agent_sessions.id", "agent_turns.session_id")
      .innerJoin("clankers", "clankers.id", "agent_sessions.clanker_id")
      .select([
        "agent_turns.id",
        "agent_turns.session_id",
        "agent_turns.action",
        "agent_turns.status",
        "agent_turns.content_json",
        "agent_turns.job_id",
        "agent_turns.created_at",
        "clankers.id as clanker_id",
        "clankers.name as clanker_name",
      ])
      .where("agent_sessions.ticket_id", "=", ticketId)
      .where("agent_turns.role", "=", "assistant")
      // Turns from before the engine had no action; the thread shows their runs as events instead.
      .where("agent_turns.action", "is not", null)
      .orderBy("agent_turns.created_at", "asc")
      .execute();
    return rows.flatMap((row) =>
      isTaskTurnAction(row.action)
        ? [
            {
              id: row.id,
              sessionId: row.session_id,
              agent: { id: row.clanker_id, name: row.clanker_name },
              action: row.action,
              status: row.status,
              outcome: outcomeOf(row.content_json),
              jobId: row.job_id,
              createdAt: row.created_at,
            },
          ]
        : [],
    );
  }
}
