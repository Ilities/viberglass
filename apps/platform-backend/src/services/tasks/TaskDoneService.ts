import { TICKET_STATUS } from "@viberglass/types";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TICKET_SERVICE_ERROR_CODE, TicketServiceError } from "../errors/TicketServiceError";
import { TicketLifecycleStatusService } from "../TicketLifecycleStatusService";
import { TaskChangePolicyService, type TaskChanger } from "./TaskChangePolicyService";
import { TaskActivityRecorder, type ActivityActor } from "./TaskActivityRecorder";
import { TaskParticipantService } from "./TaskParticipantService";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket" | "updateTicket">;
  lifecycle: Pick<TicketLifecycleStatusService, "synchronize">;
  access: Pick<TaskParticipantService, "assertCanSeeTask">;
  policy: Pick<TaskChangePolicyService, "assertCanChange">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/**
 * Finishing a task and opening it again, so every way of doing either records
 * it in the task's Activity the same way. Done merges nothing.
 */
export class TaskDoneService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tickets: new TicketDAO(),
      lifecycle: new TicketLifecycleStatusService(),
      access: new TaskParticipantService(),
      policy: new TaskChangePolicyService(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  /** From outside the web app, with the web's checks: the person can see the task and may change it. */
  async markDone(taskId: string, person: TaskChanger): Promise<void> {
    await this.deps.access.assertCanSeeTask(taskId, person.id);
    await this.deps.policy.assertCanChange(person, taskId, "edit");
    if (!(await this.deps.tickets.getTicket(taskId))) {
      throw new TicketServiceError(TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND, "That task isn't there any more.");
    }
    await this.finish(taskId, { type: "human", userId: person.id });
  }

  /** Marks the task done; a task that's done already is left as it is. Whether it changed. */
  async finish(taskId: string, actor: ActivityActor, payload: Record<string, unknown> = {}): Promise<boolean> {
    const ticket = await this.deps.tickets.getTicket(taskId);
    if (!ticket || ticket.status === TICKET_STATUS.RESOLVED) return false;
    await this.deps.tickets.updateTicket(taskId, { status: TICKET_STATUS.RESOLVED });
    await this.deps.activity.record(taskId, actor, "task_done", payload);
    return true;
  }

  /** Opens a done task again, at the status its work puts it in. Whether it changed. */
  async reopen(taskId: string, actor: ActivityActor, payload: Record<string, unknown> = {}): Promise<boolean> {
    const ticket = await this.deps.tickets.getTicket(taskId);
    if (!ticket || ticket.status !== TICKET_STATUS.RESOLVED) return false;
    await this.deps.tickets.updateTicket(taskId, { status: TICKET_STATUS.OPEN });
    await this.deps.lifecycle.synchronize(taskId);
    await this.deps.activity.record(taskId, actor, "task_reopened", payload);
    return true;
  }
}
