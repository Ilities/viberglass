import db from "../../persistence/config/database";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_TURN_STATUS,
} from "../../types/agentSession";

export type CancelJobResult = "cancelled" | "already_cancelled" | "terminal" | "not_found";

export class JobCancellationService {
  constructor(
    private readonly sessionDAO = new AgentSessionDAO(),
    private readonly turnDAO = new AgentTurnDAO(),
    private readonly eventDAO = new AgentSessionEventDAO(),
  ) {}

  async cancel(jobId: string, cancelledBy?: string): Promise<CancelJobResult> {
    const job = await db
      .selectFrom("jobs")
      .select(["status", "agent_session_id", "agent_turn_id"])
      .where("id", "=", jobId)
      .executeTakeFirst();
    if (!job) return "not_found";
    if (job.status === "cancelled") return "already_cancelled";
    if (job.status === "completed" || job.status === "failed") return "terminal";

    await db
      .updateTable("jobs")
      .set({
        status: "cancelled",
        finished_at: new Date(),
        error_message: "Run cancelled by user",
      })
      .where("id", "=", jobId)
      .where("status", "in", ["queued", "active"])
      .execute();

    if (job.agent_turn_id) {
      await this.turnDAO.update(job.agent_turn_id, {
        status: AGENT_TURN_STATUS.CANCELLED,
      });
    }
    if (job.agent_session_id) {
      const session = await this.sessionDAO.getById(job.agent_session_id);
      if (session && session.status !== AGENT_SESSION_STATUS.CANCELLED) {
        const sequence = await this.eventDAO.getMaxSequence(session.id);
        await this.eventDAO.create({
          sessionId: session.id,
          sequence: sequence + 1,
          eventType: AGENT_SESSION_EVENT_TYPE.SESSION_CANCELLED,
          payloadJson: { cancelledBy: cancelledBy ?? null, jobId },
        });
        await this.sessionDAO.update(session.id, {
          status: AGENT_SESSION_STATUS.CANCELLED,
          completedAt: new Date(),
        });
      }
    }
    return "cancelled";
  }
}
