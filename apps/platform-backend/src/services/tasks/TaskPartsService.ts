import { partRangeName, TICKET_WORKFLOW_PHASE, type PartRange, type TaskPlanParts, type Ticket } from "@viberglass/types";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
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
  pullRequests: Pick<TaskPullRequestDAO, "listWithStates">;
  /** Made when needed: the checker's merge listener uses this service in turn. */
  checker: () => Pick<PullRequestOutcomeChecker, "check">;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Where a task's plan stands part by part, and which parts a build may cover:
 * parts are built in order, and a later part only once every earlier part's
 * pull request is merged.
 */
export class TaskPartsService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      documents: new TicketPhaseDocumentDAO(),
      pullRequests: new TaskPullRequestDAO(),
      checker: () => createPullRequestOutcomeChecker(),
      ...deps,
    };
  }

  /** With `fresh`, an open pull request whose state is old is read again first, so a merge just made counts. */
  async state(ticket: PartsTicket, { fresh = false }: { fresh?: boolean } = {}): Promise<TaskPlanParts> {
    const [document, pullRequests] = await Promise.all([
      this.deps.documents.getByTicketAndPhase(ticket.id, TICKET_WORKFLOW_PHASE.PLANNING),
      this.deps.pullRequests.listWithStates(ticket.id),
    ]);
    const open = pullRequests.filter((pullRequest) => pullRequest.state !== "merged" && pullRequest.state !== "closed").at(-1);
    const stale = open?.url && (!open.checkedAt || Date.now() - open.checkedAt.getTime() > STALE_AFTER_MS);
    if (fresh && open?.url && stale) {
      await this.deps.checker().check(open.url, ticket.projectId ?? null);
      return taskPlanParts(document?.content ?? "", await this.deps.pullRequests.listWithStates(ticket.id));
    }
    return taskPlanParts(document?.content ?? "", pullRequests);
  }

  /**
   * The parts a build asked for now covers, in a new pull request; null when
   * it continues the open one. Without parts asked for, a build continues the
   * open pull request, else builds every part that's left.
   */
  async resolveBuild(ticket: PartsTicket, requested: PartRange | null): Promise<PartRange | null> {
    const { parts, open, next } = await this.state(ticket, { fresh: true });
    if (open) {
      if (!requested || (requested.first === open.first && requested.last === open.last)) return null;
      throw new TaskTurnError(
        TASK_TURN_ERROR_CODE.PART_NOT_NEXT,
        `${capitalised(partRangeName(open))}'s pull request isn't merged yet; the next part can be built once it is.`,
      );
    }
    // A plan in one part, or none, is built as a whole, again if asked after its pull request merged.
    if (parts.length <= 1) return { first: 1, last: null };
    if (next === null) throw new TaskTurnError(TASK_TURN_ERROR_CODE.PART_NOT_NEXT, "Every part of the plan is built already.");
    if (!requested) return { first: next, last: null };

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
