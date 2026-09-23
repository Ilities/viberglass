import db from "../../persistence/config/database";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_TURN_STATUS,
} from "../../types/agentSession";
import { createChildLogger } from "../../config/logger";
import type { WorkerStopper } from "../../workers/WorkerStopper";
import { DockerWorkerStopper } from "../../workers/stoppers/DockerWorkerStopper";

export type CancelJobResult = "cancelled" | "already_cancelled" | "terminal" | "not_found";

const logger = createChildLogger({ service: "JobCancellationService" });

export class JobCancellationService {
  constructor(
    private readonly sessionDAO = new AgentSessionDAO(),
    private readonly turnDAO = new AgentTurnDAO(),
    private readonly eventDAO = new AgentSessionEventDAO(),
    private readonly workerStoppers: WorkerStopper[] = [new DockerWorkerStopper()],
  ) {}

  /** Cancels a run, stops its worker, and cancels the live session it belongs to. */
  async cancel(jobId: string, cancelledBy?: string): Promise<CancelJobResult> {
    const job = await db
      .selectFrom("jobs")
      .select(["status", "agent_session_id", "agent_turn_id"])
      .where("id", "=", jobId)
      .executeTakeFirst();
    if (!job) return "not_found";

    const result = await this.stopJob(jobId, job.status);
    if (result !== "cancelled") return result;

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

  /**
   * Marks the run cancelled and stops its worker, without touching any session.
   * Once cancelled, worker callbacks for the run are rejected as terminal.
   */
  async stopJob(jobId: string, knownStatus?: string): Promise<CancelJobResult> {
    const status = knownStatus ?? (await this.getStatus(jobId));
    if (status === undefined) return "not_found";
    if (status === "cancelled") return "already_cancelled";
    if (status === "completed" || status === "failed") return "terminal";

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

    await this.stopWorker(jobId);
    return "cancelled";
  }

  private async getStatus(jobId: string): Promise<string | undefined> {
    const job = await db
      .selectFrom("jobs")
      .select(["status"])
      .where("id", "=", jobId)
      .executeTakeFirst();
    return job?.status;
  }

  /** Best effort: the run is already cancelled in the database either way. */
  private async stopWorker(jobId: string): Promise<void> {
    for (const stopper of this.workerStoppers) {
      try {
        if (await stopper.stop(jobId)) {
          logger.info("Stopped worker for cancelled run", { jobId, stopper: stopper.name });
          return;
        }
      } catch (error) {
        logger.warn("Failed to stop worker for cancelled run", {
          jobId,
          stopper: stopper.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
