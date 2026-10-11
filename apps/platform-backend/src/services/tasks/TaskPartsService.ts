import { partRangeName, TICKET_WORKFLOW_PHASE, type PartRange, type TaskPlanParts, type Ticket } from "@viberglass/types";
import { TaskPlanPartMarkDAO } from "../../persistence/ticketing/TaskPlanPartMarkDAO";
import { TaskPullRequestDAO, type TaskPullRequestRow } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TicketPhaseDocumentDAO } from "../../persistence/ticketing/TicketPhaseDocumentDAO";
import { TASK_TURN_ERROR_CODE, TaskTurnError } from "../errors/TaskTurnError";
import { createPullRequestOutcomeChecker } from "../pull-request-outcomes/createPullRequestOutcomeChecker";
import type { PullRequestOutcomeChecker } from "../pull-request-outcomes/PullRequestOutcomeChecker";
import { taskPlanParts } from "./taskPlanParts";

/** How old a pull request's known state may be before it's read again from the SCM when it matters. */
const STALE_AFTER_MS = 60_000;

/** A task's space is needed only to read a pull request's state afresh. */
type PartsTicket = Pick<Ticket, "id"> & Partial<Pick<Ticket, "projectId">>;

interface Dependencies {
  documents: Pick<TicketPhaseDocumentDAO, "getByTicketAndPhase">;
  pullRequests: Pick<TaskPullRequestDAO, "listWithStates" | "extendTo">;
  marks: Pick<TaskPlanPartMarkDAO, "list">;
  /** Made when needed: the checker's merge listener uses this service in turn. */
  checker: () => Pick<PullRequestOutcomeChecker, "check">;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Where a task's plan stands part by part, and which parts a build may cover:
 * parts are built in order, and a later part only once every earlier part is
 * merged, done or skipped, unless it's added to the open pull request.
 */
export class TaskPartsService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      documents: new TicketPhaseDocumentDAO(),
      pullRequests: new TaskPullRequestDAO(),
      marks: new TaskPlanPartMarkDAO(),
      checker: () => createPullRequestOutcomeChecker(),
      ...deps,
    };
  }

  /** With `fresh`, an open pull request whose state is old is read again first, so a merge just made counts. */
  async state(ticket: PartsTicket, { fresh = false }: { fresh?: boolean } = {}): Promise<TaskPlanParts> {
    return (await this.read(ticket, { fresh })).state;
  }

  /** The state, and the pull request of the task's that's open, for changing it. */
  async read(ticket: PartsTicket, { fresh = false }: { fresh?: boolean } = {}): Promise<{ state: TaskPlanParts; open: TaskPullRequestRow | null }> {
    const [document, pullRequests, marks] = await Promise.all([
      this.deps.documents.getByTicketAndPhase(ticket.id, TICKET_WORKFLOW_PHASE.PLANNING),
      this.deps.pullRequests.listWithStates(ticket.id),
      this.deps.marks.list(ticket.id),
    ]);
    const plan = document?.content ?? "";
    let rows = pullRequests;
    const unmerged = rows.filter((pullRequest) => pullRequest.state !== "merged" && pullRequest.state !== "closed").at(-1);
    const stale = unmerged?.url && (!unmerged.checkedAt || Date.now() - unmerged.checkedAt.getTime() > STALE_AFTER_MS);
    if (fresh && unmerged?.url && stale) {
      await this.deps.checker().check(unmerged.url, ticket.projectId ?? null);
      rows = await this.deps.pullRequests.listWithStates(ticket.id);
    }
    const state = taskPlanParts(plan, rows, marks);
    const open = state.open
      ? (rows.filter((row) => row.state !== "merged" && row.state !== "closed" && row.firstPart === state.open?.first && row.lastPart === state.open?.last).at(-1) ?? null)
      : null;
    return { state, open };
  }

  /**
   * The parts a build asked for now covers, in a new pull request; null when
   * it continues the open one. Without parts asked for, a build continues the
   * open pull request, else builds every part that's left. With `add`, the
   * parts go into the open pull request instead, which builds them from now on.
   */
  async resolveBuild(ticket: PartsTicket, requested: PartRange | null, { add = false }: { add?: boolean } = {}): Promise<PartRange | null> {
    if (add) return this.addToOpen(ticket, requested);
    const { parts, open, next } = await this.state(ticket, { fresh: true });
    if (open) {
      if (!requested || (requested.first === open.first && requested.last === open.last)) return null;
      throw new TaskTurnError(
        TASK_TURN_ERROR_CODE.PART_NOT_NEXT,
        `${capitalised(partRangeName(open))}'s pull request isn't merged yet; the next part can be built once it is, or added to it.`,
      );
    }
    // A plan in one part, or none, is built as a whole, again if asked after its pull request merged.
    if (parts.length <= 1) return { first: 1, last: null };
    if (next === null) throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, "Every part of the plan is built already.");
    if (!requested) return { first: next, last: null };
    return this.checkedRange(parts, next, requested);
  }

  private async addToOpen(ticket: PartsTicket, requested: PartRange | null): Promise<PartRange> {
    const { addable, parts } = await this.state(ticket, { fresh: true });
    if (addable === null) {
      throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, "There's no open pull request a part can be added to.");
    }
    return this.checkedRange(parts, addable, requested ?? { first: addable, last: addable });
  }

  /** Has the open pull request build through `range` from now on, once a build adding it is asked for. */
  async extendOpen(ticket: PartsTicket, range: PartRange): Promise<void> {
    const { open } = await this.read(ticket);
    if (open) await this.deps.pullRequests.extendTo(ticket.id, open.branch, range.last);
  }

  /** `requested`, starting at the `next` part, with a range through the last part as through the plan's end. */
  private checkedRange(parts: TaskPlanParts["parts"], next: number, requested: PartRange): PartRange {
    const lastPart = Math.max(...parts.map((part) => part.number));
    if (requested.first !== next) {
      throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, `Part ${next} is next: parts are built in order.`);
    }
    if (requested.last !== null && (requested.last < requested.first || requested.last > lastPart)) {
      throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, `The plan's parts go from ${next} to ${lastPart}.`);
    }
    return requested.last === lastPart ? { first: requested.first, last: null } : requested;
  }
}
