import { isObjectRecord } from "@viberglass/types";
import { sql } from "kysely";
import db from "../config/database";

export interface TaskSessionMessage {
  id: string;
  sessionId: string;
  author: { id: string; name: string } | null;
  body: string;
  createdAt: Date;
}

/** What a message to a live session is stored as when the agent's tool needed a yes (AgentSessionInteractionService.approve). */
const TOOL_APPROVAL_TEXT = "Approval granted";

/** Messages are stored as "[Name]: text" so the agent knows who spoke; the thread shows the name separately. */
function withoutSpeakerPrefix(body: string): string {
  return body.replace(/^\[[^\]\n]+\]: /, "");
}

/** What people said to the agent in a task's live sessions. */
export class TaskSessionMessageDAO {
  async listForTask(ticketId: string): Promise<TaskSessionMessage[]> {
    const rows = await db
      .selectFrom("agent_turns")
      .innerJoin("agent_sessions", "agent_sessions.id", "agent_turns.session_id")
      // agent_turns.user_id is text, users.id a uuid.
      .leftJoin("users as speaker", (join) => join.on(sql<string>`speaker.id::text`, "=", sql.ref("agent_turns.user_id")))
      .leftJoin("users as starter", "starter.id", "agent_sessions.created_by")
      .select([
        "agent_turns.id",
        "agent_turns.session_id",
        "agent_turns.sequence",
        "agent_turns.content_markdown",
        "agent_turns.content_json",
        "agent_turns.created_at",
        "speaker.id as speaker_id",
        "speaker.name as speaker_name",
        "starter.id as starter_id",
        "starter.name as starter_name",
      ])
      .where("agent_sessions.ticket_id", "=", ticketId)
      .where("agent_turns.role", "=", "user")
      .orderBy("agent_turns.created_at", "asc")
      .execute();
    return rows.flatMap((row) => {
      const body = row.content_markdown?.trim();
      if (!body || body === TOOL_APPROVAL_TEXT) return [];
      // Sessions opened before the prompt moved to content_json stored the whole prompt as the opening message.
      if (row.sequence === 1 && !(isObjectRecord(row.content_json) && "fullPrompt" in row.content_json)) return [];
      // The opening message has no speaker of its own: it's whoever started the session.
      const id = row.speaker_id ?? (row.sequence === 1 ? row.starter_id : null);
      const name = row.speaker_name ?? (row.sequence === 1 ? row.starter_name : null);
      return [
        {
          id: row.id,
          sessionId: row.session_id,
          author: id && name ? { id, name } : null,
          body: withoutSpeakerPrefix(body),
          createdAt: row.created_at,
        },
      ];
    });
  }
}
