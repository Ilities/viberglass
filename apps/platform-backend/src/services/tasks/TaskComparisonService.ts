import { TASK_COMPARISON_ARMS, type Clanker, type StartTaskComparisonRequest, type Ticket } from "@viberglass/types";
import logger from "../../config/logger";
import type { TaskBranchDAO } from "../../persistence/ticketing/TaskBranchDAO";
import type { TaskComparisonDAO } from "../../persistence/ticketing/TaskComparisonDAO";
import type { TaskForkDAO } from "../../persistence/ticketing/TaskForkDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { TASK_COMPARISON_ERROR_CODE, TaskComparisonError } from "../errors/TaskComparisonError";
import type { SpaceRunAvailabilityService } from "../spaces/SpaceRunAvailabilityService";
import type { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import type { TaskTurnAgentResolver } from "../taskTurns/TaskTurnAgentResolver";
import type { TaskTurnService } from "../taskTurns/TaskTurnService";
import type { TaskDiscussionService } from "./TaskDiscussionService";
import type { TaskForkService } from "./TaskForkService";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket">;
  execution: Pick<SpaceRunAvailabilityService, "backingOf">;
  policy: Pick<TaskAskPolicyService, "assertCanAsk">;
  agents: Pick<TaskTurnAgentResolver, "resolve">;
  clankers: { getClanker(id: string): Promise<Pick<Clanker, "name"> | null> };
  comparisons: Pick<TaskComparisonDAO, "create" | "addArm" | "get" | "listArms" | "setWinner">;
  forkPoints: Pick<TaskForkDAO, "turnFinishedAt" | "lastCommitBy">;
  branches: Pick<TaskBranchDAO, "get">;
  forks: Pick<TaskForkService, "fork">;
  turns: Pick<TaskTurnService, "ask">;
  discussion: Pick<TaskDiscussionService, "create">;
}

interface ForkPoint {
  at: Date;
  turnId: string | null;
  baseBranch: string | null;
  baseCommit: string | null;
}

/**
 * Runs one task with several runners side by side: forks the task once per
 * runner at the same moment and sends each fork the same ask. Each fork is a
 * task of its own, with its own session, branch and pull request, so runs
 * on one never touch another's. The original points at the fork picked.
 */
export class TaskComparisonService {
  constructor(private readonly deps: Dependencies) {}

  async start(parentId: string, actorId: string, request: StartTaskComparisonRequest): Promise<string> {
    const parent = await this.requireTask(parentId);
    const agentIds = [...new Set(request.agentIds)];
    if (agentIds.length < TASK_COMPARISON_ARMS.min || agentIds.length > TASK_COMPARISON_ARMS.max) {
      throw new TaskComparisonError(
        TASK_COMPARISON_ERROR_CODE.RUNNER_COUNT,
        `Pick ${TASK_COMPARISON_ARMS.min} to ${TASK_COMPARISON_ARMS.max} different agents to compare.`,
      );
    }
    // A Files space's runs share its files one at a time, so its forks couldn't run side by side.
    if ((await this.deps.execution.backingOf(parent.projectId)) === "files") {
      throw new TaskComparisonError(TASK_COMPARISON_ERROR_CODE.FILES_SPACE, "Comparing agents needs a space with a repository.");
    }
    const action = request.action ?? "reply";
    await this.deps.policy.assertCanAsk(actorId, parent.id, action);
    for (const agentId of agentIds) await this.deps.agents.resolve(parent.id, { agentId, message: request.message });

    const point = await this.forkPoint(parent.id, request.fromTurnId ?? null);
    const comparisonId = await this.deps.comparisons.create({
      parentTicketId: parent.id,
      forkedFromTurnId: point.turnId,
      forkedAt: point.at,
      baseBranch: point.baseBranch,
      baseCommit: point.baseCommit,
      createdBy: actorId,
    });

    const arms: Array<{ fork: Ticket; agentId: string; runnerName: string }> = [];
    for (const [position, agentId] of agentIds.entries()) {
      const runner = await this.deps.clankers.getClanker(agentId);
      const fork = await this.deps.forks.fork(parent, point.at, `${parent.title} · ${runner?.name ?? "agent"}`, actorId);
      await this.deps.comparisons.addArm(comparisonId, fork.id, agentId, position);
      arms.push({ fork, agentId, runnerName: runner?.name ?? "agent" });
    }
    // Plain keys: task lists preview the thread's last message as text, and the comparison panel links each fork.
    await this.deps.discussion.create(
      parent.id,
      actorId,
      `Comparing ${arms.map((arm) => `${arm.runnerName} (${arm.fork.key})`).join(", ")} on forks of this task.`,
    );
    // One fork failing to start leaves the others running; its card shows it has no runs.
    const asked = await Promise.allSettled(
      arms.map(({ fork, agentId }) => this.deps.turns.ask(fork.id, actorId, { message: request.message, action, agentId })),
    );
    asked.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.warn("A comparison fork couldn't start", {
          comparisonId,
          ticketId: arms[index].fork.id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
    return comparisonId;
  }

  /** Points the original at one fork's work, or at none; the thread says which. */
  async pickWinner(parentId: string, comparisonId: string, winnerTicketId: string | null, actorId: string): Promise<void> {
    const comparison = await this.deps.comparisons.get(comparisonId);
    if (!comparison || comparison.parentTicketId !== parentId) {
      throw new TaskComparisonError(TASK_COMPARISON_ERROR_CODE.COMPARISON_NOT_FOUND, "Comparison not found");
    }
    const arm = winnerTicketId ? (await this.deps.comparisons.listArms([comparisonId])).find((a) => a.ticketId === winnerTicketId) : null;
    if (winnerTicketId && !arm) {
      throw new TaskComparisonError(TASK_COMPARISON_ERROR_CODE.NOT_AN_ARM, "That task isn't part of this comparison");
    }
    await this.deps.comparisons.setWinner(comparisonId, winnerTicketId);
    await this.deps.discussion.create(
      parentId,
      actorId,
      arm ? `Picked ${arm.runner.name}'s work from the comparison: ${arm.key}.` : "Unpicked the comparison's winner.",
    );
  }

  /** The moment forks start from: when `turnId` finished, or now; and the code the task had then. */
  private async forkPoint(parentId: string, turnId: string | null): Promise<ForkPoint> {
    if (!turnId) {
      const branch = await this.deps.branches.get(parentId);
      return { at: new Date(), turnId: null, baseBranch: branch, baseCommit: null };
    }
    const at = await this.deps.forkPoints.turnFinishedAt(parentId, turnId);
    if (!at) throw new TaskComparisonError(TASK_COMPARISON_ERROR_CODE.TURN_NOT_FOUND, "Forks start from one of this task's finished agent turns.");
    const pushed = await this.deps.forkPoints.lastCommitBy(parentId, at);
    return { at, turnId, baseBranch: pushed?.branch ?? null, baseCommit: pushed?.commit ?? null };
  }

  private async requireTask(id: string): Promise<Ticket> {
    const ticket = await this.deps.tickets.getTicket(id);
    if (!ticket) throw new TaskComparisonError(TASK_COMPARISON_ERROR_CODE.TASK_NOT_FOUND, "Task not found");
    return ticket;
  }
}
