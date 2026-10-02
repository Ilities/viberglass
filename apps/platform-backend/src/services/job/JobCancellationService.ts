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
import { EcsWorkerStopper } from "../../workers/stoppers/EcsWorkerStopper";
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
    // Lambda can't be stopped mid-invocation: its run is marked cancelled and its late result refused.
    private readonly workerStoppers: WorkerStopper[] = [new DockerWorkerStopper(), new EcsWorkerStopper()],
    private readonly ticketStatus: TicketStatusSynchronizer = new TicketLifecycleStatusService(),
    private readonly activity: Pick<TaskActivityRecorder, "record"> = new TaskActivityRecorder(),
  ) {}

  /**
   * Cancels a run and stops its worker. A run that was a turn of the task's
   * conversation ends that turn first, so the worker, given a moment to keep
   * what it had done, finds the turn stopped; the session stays, waiting on people.
   */
  async cancel(jobId: string, cancelledBy?: string): Promise<CancelJobResult> {
    const job = await this.getJob(jobId);
    if (!job) return "not_found";
    return this.stopJob(jobId, cancelledBy, async () => {
      if (job.ticket_id) {
        await this.activity.record(job.ticket_id, cancelledBy ? { type: "human", userId: cancelledBy } : { type: "system" }, "run_cancelled", {
          jobId,
        });
      }
      await this.endTurn(jobId, cancelledBy);
    });
  }

  /**
   * Marks the run cancelled and stops its worker, without touching any session
   * unless `beforeWorkerStops` does. Once cancelled, the run's result is refused.
   */
  async stopJob(jobId: string, cancelledBy?: string, beforeWorkerStops?: () => Promise<void>): Promise<CancelJobResult> {
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
        cancelled_by: cancelledBy ?? null,
      })
      .where("id", "=", jobId)
      .where("status", "in", ["queued", "active"])
      .execute();

    await beforeWorkerStops?.();
    await new WorkerStopperChain(this.workerStoppers).stop(jobId, "cancelled");
    if (job.ticket_id) await this.synchronizeTicketStatus(job.ticket_id);
    return "cancelled";
  }

  private async endTurn(jobId: string, cancelledBy: string | undefined): Promise<void> {
    const turn = await this.turnDAO.getByJobId(jobId);
    if (!turn) return;
    await this.turnDAO.update(turn.id, { status: AGENT_TURN_STATUS.CANCELLED, completedAt: new Date() });
    const session = await this.sessionDAO.getById(turn.sessionId);
    if (session?.status !== AGENT_SESSION_STATUS.ACTIVE) return;
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
