import { NATIVE_TICKET_ORIGIN, type Ticket } from "@viberglass/types";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { SpaceAccessService, SpaceViewer } from "../spaces/SpaceAccessService";
import { TASK_COPY_ERROR_CODE, TaskCopyError } from "../errors/TaskCopyError";
import type { TaskDiscussionService } from "./TaskDiscussionService";

interface Dependencies {
  tickets: Pick<TicketDAO, "getTicket" | "createTicket" | "getSummary">;
  spaceAccess: Pick<SpaceAccessService, "assertCanSee">;
  discussion: Pick<TaskDiscussionService, "create">;
}

/**
 * Copies a task into another space, for work that turns out to need that
 * space's repository: a new task with the same title and description, each
 * thread saying where the other is. Links, plan and runs stay with the original.
 */
export class TaskCopyService {
  constructor(private readonly deps: Dependencies) {}

  async copy(ticketId: string, targetSpaceId: string, viewer: SpaceViewer): Promise<Ticket> {
    const original = await this.deps.tickets.getTicket(ticketId);
    if (!original) throw new TaskCopyError(TASK_COPY_ERROR_CODE.TASK_NOT_FOUND, "Task not found");
    const { projectId } = await this.deps.spaceAccess.assertCanSee(viewer, targetSpaceId);
    if (projectId === original.projectId) throw new TaskCopyError(TASK_COPY_ERROR_CODE.SAME_SPACE, "The task is already in that space");

    const copy = await this.deps.tickets.createTicket({
      projectId,
      title: original.title,
      description: original.description,
      severity: original.severity,
      category: original.category,
      metadata: { timestamp: new Date().toISOString(), timezone: "UTC" },
      annotations: [],
      autoFixRequested: false,
      ticketSystem: NATIVE_TICKET_ORIGIN,
      requesterId: viewer.id,
    });

    const [from, to] = await Promise.all([this.deps.tickets.getSummary(original.id), this.deps.tickets.getSummary(copy.id)]);
    if (from && to) {
      await this.deps.discussion.create(original.id, viewer.id, `Copied to ${taskReference(to)}.`);
      await this.deps.discussion.create(copy.id, viewer.id, `Copied from ${taskReference(from)}.`);
    }
    return copy;
  }
}

function taskReference(task: { key: string; title: string; spaceSlug: string; spaceName: string }): string {
  return `[${task.key}](/spaces/${task.spaceSlug}/tasks/${task.key}) in ${task.spaceName}`;
}
