import type { TaskParticipant, TaskParticipantRole } from "@viberglass/types";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { SpaceAccessService } from "../spaces/SpaceAccessService";
import { TASK_PARTICIPANT_ERROR_CODE, TaskParticipantError } from "../errors/TaskParticipantError";
import { TaskActivityRecorder } from "./TaskActivityRecorder";

interface Dependencies {
  participants: Pick<TaskParticipantDAO, "list" | "setOwner" | "add" | "remove">;
  users: Pick<UserDAO, "findById">;
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask">;
  access: Pick<SpaceAccessService, "assertCanSee">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/** Who is on a task. Only people who can see the task's space can be put on it. */
export class TaskParticipantService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      participants: new TaskParticipantDAO(),
      users: new UserDAO(),
      owners: new SpaceOwnershipDAO(),
      access: new SpaceAccessService(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  list(ticketId: string): Promise<TaskParticipant[]> {
    return this.deps.participants.list(ticketId);
  }

  async setOwner(ticketId: string, userId: string, actorId: string): Promise<TaskParticipant[]> {
    await this.assertCanSeeTask(ticketId, userId);
    await this.deps.participants.setOwner(ticketId, userId, actorId);
    await this.deps.activity.record(ticketId, { type: "human", userId: actorId }, "owner_changed", { userId });
    return this.list(ticketId);
  }

  async add(ticketId: string, userId: string, role: TaskParticipantRole, actorId: string): Promise<TaskParticipant[]> {
    if (role !== "reviewer" && role !== "watcher") {
      throw new TaskParticipantError(
        TASK_PARTICIPANT_ERROR_CODE.ROLE_NOT_CHANGEABLE,
        "Add reviewers and watchers here; a task's owner is changed on its own, and its requester doesn't change.",
      );
    }
    await this.assertCanSeeTask(ticketId, userId);
    await this.deps.participants.add(ticketId, userId, role, actorId);
    await this.deps.activity.record(ticketId, { type: "human", userId: actorId }, role === "reviewer" ? "reviewer_added" : "watcher_added", {
      userId,
    });
    return this.list(ticketId);
  }

  async remove(ticketId: string, userId: string, role: TaskParticipantRole, actorId: string): Promise<TaskParticipant[]> {
    if (role === "requester" || role === "owner") {
      throw new TaskParticipantError(
        TASK_PARTICIPANT_ERROR_CODE.ROLE_NOT_CHANGEABLE,
        "A task always has its requester, and its owner is replaced rather than removed.",
      );
    }
    if (!(await this.deps.participants.remove(ticketId, userId, role))) {
      throw new TaskParticipantError(TASK_PARTICIPANT_ERROR_CODE.NOT_A_PARTICIPANT, `That person isn't a ${role} on this task.`);
    }
    await this.deps.activity.record(ticketId, { type: "human", userId: actorId }, role === "reviewer" ? "reviewer_removed" : "watcher_removed", {
      userId,
    });
    return this.list(ticketId);
  }

  /** Refuses someone who couldn't open the task: they'd be notified about work they can't see. */
  async assertCanSeeTask(ticketId: string, userId: string): Promise<void> {
    const projectId = await this.deps.owners.projectIdForTask(ticketId);
    if (!projectId) throw cantSee();
    await this.assertCanSeeSpace(projectId, userId);
  }

  /** The same check for a task that's about to be created in this space. */
  async assertCanSeeSpace(projectId: string, userId: string): Promise<void> {
    const user = await this.deps.users.findById(userId);
    if (!user || user.deactivatedAt) throw cantSee();
    try {
      await this.deps.access.assertCanSee({ id: user.id, role: user.role }, projectId);
    } catch {
      throw cantSee();
    }
  }
}

function cantSee() {
  return new TaskParticipantError(TASK_PARTICIPANT_ERROR_CODE.PERSON_CANT_SEE_TASK, "That person can't see this task's space.");
}
