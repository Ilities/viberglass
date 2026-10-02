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
import { configuredWorkerStoppers } from "../../workers/configuredWorkerStoppers";
import { WorkerStopperChain } from "../../workers/WorkerStopperChain";
import { TicketLifecycleStatusService } from "../TicketLifecycleStatusService";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";

interface TicketStatusSynchronizer {
  synchronize(ticketId: string): Promise<unknown>;
}

export type CancelJobResult = "cancelled" | "already_cancelled" | "terminal" | "not_found";

const logger = createChildLogger({ service: "JobCancellationService" });

export class JobCancellationService {
  constructor(
    private readonly sessionDAO = new AgentSessionDAO(),
    private readonly turnDAO = new AgentTurnDAO(),
    private readonly eventDAO = new AgentSessionEventDAO(),
    private readonly workerStoppers: WorkerStopper[] = configuredWorkerStoppers(),
    private readonly ticketStatus: TicketStatusSynchronizer = new TicketLifecycleStatusService(),
    private readonly activity: Pick<TaskActivityRecorder, "record"> = new TaskActivityRecorder(),
  ) {}

  /**
   * Cancels a run and stops its worker. A run that was a turn of the task's
   * conversation ends that turn; the session stays, waiting on people.
   */
  async cancel(jobId: string, cancelledBy?: string): Promise<CancelJobResult> {
    const job = await this.getJob(jobId);
    if (!job) return "not_found";

    const result = await this.stopJob(jobId);
    if (result !== "cancelled") return result;

    if (job.ticket_id) {
      await this.activity.record(job.ticket_id, cancelledBy ? { type: "human", userId: cancelledBy } : { type: "system" }, "run_cancelled", {
        jobId,
      });
    }

    const turn = await this.turnDAO.getByJobId(jobId);
    if (!turn) return "cancelled";
    await this.turnDAO.update(turn.id, { status: AGENT_TURN_STATUS.CANCELLED, completedAt: new Date() });
    const session = await this.sessionDAO.getById(turn.sessionId);
    if (session?.status === AGENT_SESSION_STATUS.ACTIVE) {
      const sequence = await this.eventDAO.getMaxSequence(session.id);
      await this.eventDAO.create({
        sessionId: session.id,
        turnId: turn.id,
        sequence: sequence + 1,
        eventType: AGENT_SESSION_EVENT_TYPE.TURN_FAILED,
        payloadJson: { reason: "Cancelled", cancelledBy: cancelledBy ?? null, jobId },
      });
      await this.sessionDAO.update(session.id, { status: AGENT_SESSION_STATUS.WAITING_ON_USER });
    }
    return "cancelled";
  }

  /**
   * Marks the run cancelled and stops its worker, without touching any session.
   * Once cancelled, worker callbacks for the run are rejected as terminal.
   */
  async stopJob(jobId: string): Promise<CancelJobResult> {
    const job = await this.getJob(jobId);
    if (!job) return "not_found";
    const { status } = job;
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

    await new WorkerStopperChain(this.workerStoppers).stop(jobId, "cancelled");
    if (job.ticket_id) await this.synchronizeTicketStatus(job.ticket_id);
    return "cancelled";
  }

  private async getJob(jobId: string) {
    return db
      .selectFrom("jobs")
      .select(["status", "ticket_id"])
      .where("id", "=", jobId)
      .executeTakeFirst();
  }

  /** Best effort, like stopping the worker: the run is cancelled either way. */
  private async synchronizeTicketStatus(ticketId: string): Promise<void> {
    try {
      await this.ticketStatus.synchronize(ticketId);
    } catch (error) {
      logger.warn("Failed to synchronize ticket status after cancel", {
        ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
