import type { TaskCodeBranch } from "@viberglass/types";
import { TaskTakeoverDAO } from "../../persistence/ticketing/TaskTakeoverDAO";
import { TASK_ASK_POLICY_ERROR_CODE, TaskAskPolicyError } from "../errors/TaskAskPolicyError";
import { TaskSteeringService } from "../taskTurns/TaskSteeringService";
import { TaskTurnService } from "../taskTurns/TaskTurnService";
import { TaskActivityRecorder } from "./TaskActivityRecorder";
import { TaskCodeBranchService } from "./TaskCodeBranchService";

/** What the agent is told when the work comes back with no note. */
export const HANDED_BACK = "I've handed the work back. Carry on from what's on the task's branch now.";

interface Dependencies {
  steering: Pick<TaskSteeringService, "pause" | "resume">;
  turns: Pick<TaskTurnService, "ask">;
  takeovers: Pick<TaskTakeoverDAO, "set" | "clear" | "get">;
  branches: Pick<TaskCodeBranchService, "describe">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/**
 * Taking a task's work over from the agent, and handing it back. Taking over
 * pauses the agent and says where the work is, the task's branch; handing back
 * lets it carry on from what the person pushed there, which the next turn is told.
 */
export class TaskTakeoverService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    const turns = deps.turns ?? new TaskTurnService();
    this.deps = {
      steering: new TaskSteeringService({ turns }),
      turns,
      takeovers: new TaskTakeoverDAO(),
      branches: new TaskCodeBranchService(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  async takeOver(taskId: string, actorId: string): Promise<TaskCodeBranch | null> {
    // Pausing checks they may steer the agent.
    await this.deps.steering.pause(taskId, actorId);
    await this.deps.takeovers.set(taskId, actorId);
    await this.deps.activity.record(taskId, { type: "human", userId: actorId }, "taken_over", { userId: actorId });
    return this.deps.branches.describe(taskId, { claim: true });
  }

  async handBack(taskId: string, actorId: string, note: string): Promise<void> {
    if (!(await this.deps.takeovers.get(taskId))) {
      throw new TaskAskPolicyError(TASK_ASK_POLICY_ERROR_CODE.NOT_ALLOWED, "Nobody has taken this task's work over.");
    }
    const message = note.trim() || HANDED_BACK;
    // Resuming checks they may steer the agent; with nothing paused, the note is the agent's next ask.
    const resumed = await this.deps.steering.resume(taskId, actorId, message);
    if (!resumed) await this.deps.turns.ask(taskId, actorId, { message });
    await this.deps.takeovers.clear(taskId);
    await this.deps.activity.record(taskId, { type: "human", userId: actorId }, "handed_back", { userId: actorId });
  }
}
