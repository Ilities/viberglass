import { isPartFinished, partRangeName, TICKET_STATUS, type TaskPlanPartMark } from "@viberglass/types";
import { TaskPlanPartMarkDAO } from "../../persistence/ticketing/TaskPlanPartMarkDAO";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TASK_TURN_ERROR_CODE, TaskTurnError } from "../errors/TaskTurnError";
import { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import { TicketLifecycleStatusService } from "../TicketLifecycleStatusService";
import { TaskActivityRecorder } from "./TaskActivityRecorder";
import { TaskPartsService } from "./TaskPartsService";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket" | "updateTicket" | "hasRunningJob">;
  policy: Pick<TaskAskPolicyService, "assertCanAsk">;
  parts: Pick<TaskPartsService, "read">;
  marks: Pick<TaskPlanPartMarkDAO, "set" | "clear">;
  pullRequests: Pick<TaskPullRequestDAO, "discardUnopened">;
  activity: Pick<TaskActivityRecorder, "record">;
  lifecycle: Pick<TicketLifecycleStatusService, "synchronize">;
}

/**
 * The ways around building a plan part by part: marking a part done or
 * skipped when that's known some other way than its pull request merging, and
 * discarding a build that never opened its pull request. Whoever may ask for
 * a build may do these. Marking the last part finishes the task, as a merge does.
 */
export class TaskPartMarksService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      tickets: new TicketDAO(),
      policy: new TaskAskPolicyService(),
      parts: new TaskPartsService(),
      marks: new TaskPlanPartMarkDAO(),
      pullRequests: new TaskPullRequestDAO(),
      activity: new TaskActivityRecorder(),
      lifecycle: new TicketLifecycleStatusService(),
      ...deps,
    };
  }

  async mark(taskId: string, actorId: string, partNumber: number, mark: TaskPlanPartMark): Promise<void> {
    const ticket = await this.allowed(taskId, actorId);
    const { state } = await this.deps.parts.read(ticket);
    const part = state.parts.find((candidate) => candidate.number === partNumber);
    if (!part || state.parts.length < 2) throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, `The plan has no part ${partNumber}.`);
    if (part.status === "merged") throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, `Part ${partNumber} is merged already.`);

    await this.deps.marks.set(taskId, partNumber, mark, actorId);
    await this.deps.activity.record(taskId, { type: "human", userId: actorId }, "part_marked", { part: partNumber, mark });

    const after = await this.deps.parts.read(ticket);
    if (ticket.status !== TICKET_STATUS.RESOLVED && after.state.parts.every((candidate) => isPartFinished(candidate.status))) {
      await this.deps.tickets.updateTicket(taskId, { status: TICKET_STATUS.RESOLVED });
      await this.deps.activity.record(taskId, { type: "human", userId: actorId }, "task_done");
    }
  }

  /** Taking back the mark on a finished task opens it again, since a part is left to build. */
  async unmark(taskId: string, actorId: string, partNumber: number): Promise<void> {
    const ticket = await this.allowed(taskId, actorId);
    await this.deps.marks.clear(taskId, partNumber);

    const reopened = ticket.status === TICKET_STATUS.RESOLVED;
    if (reopened) {
      await this.deps.tickets.updateTicket(taskId, { status: TICKET_STATUS.OPEN });
      await this.deps.lifecycle.synchronize(taskId);
    }
    await this.deps.activity.record(taskId, { type: "human", userId: actorId }, "part_unmarked", {
      part: partNumber,
      ...(reopened ? { reopened: true } : {}),
    });
  }

  /** Forgets the open build's branch when it never opened its pull request, so its parts can be built again. */
  async discardBuild(taskId: string, actorId: string): Promise<void> {
    const ticket = await this.allowed(taskId, actorId);
    const { state, open } = await this.deps.parts.read(ticket);
    if (!open || !state.open || open.url) {
      throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, "There's no build without a pull request to discard.");
    }
    if (await this.deps.tickets.hasRunningJob(taskId)) {
      throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, "A run is still going on this task; stop it first, or wait for it to finish.");
    }
    if (!(await this.deps.pullRequests.discardUnopened(taskId, open.branch))) return;
    await this.deps.activity.record(taskId, { type: "human", userId: actorId }, "build_discarded", {
      parts: partRangeName(state.open),
    });
  }

  private async allowed(taskId: string, actorId: string) {
    const ticket = await this.deps.tickets.getTicket(taskId);
    if (!ticket) throw new TaskTurnError(TASK_TURN_ERROR_CODE.TASK_NOT_FOUND, "Task not found");
    await this.deps.policy.assertCanAsk(actorId, taskId, "code");
    return ticket;
  }
}
