import { canChangeTask, type TaskChange, type TaskChangeCapabilities, type WorkspaceRole } from "@viberglass/types";
import { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { TASK_CHANGE_POLICY_ERROR_CODE, TaskChangePolicyError } from "../errors/TaskChangePolicyError";

interface Dependencies {
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask">;
  members: Pick<SpaceMemberDAO, "getRole">;
  participants: Pick<TaskParticipantDAO, "list">;
}

export interface TaskChanger {
  id: string;
  role: WorkspaceRole;
}

const REFUSAL: Record<TaskChange, string> = {
  edit: "Only this task's requester and owner, this space's maintainers or a workspace admin can change it.",
  delete: "Only a workspace admin can delete a task. Archive it instead to hide it.",
};

/** The one place that decides who may edit, archive, close or delete a task. Visibility is checked by the route's space guard. */
export class TaskChangePolicyService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      owners: new SpaceOwnershipDAO(),
      members: new SpaceMemberDAO(),
      participants: new TaskParticipantDAO(),
      ...deps,
    };
  }

  /** A task that doesn't exist passes, so the route answers 404 as before. */
  async assertCanChange(person: TaskChanger, ticketId: string, change: TaskChange): Promise<void> {
    const allowed = await this.allows(person, ticketId);
    if (!allowed || allowed(change)) return;
    throw new TaskChangePolicyError(TASK_CHANGE_POLICY_ERROR_CODE.NOT_ALLOWED, REFUSAL[change]);
  }

  async describe(person: TaskChanger, ticketId: string): Promise<TaskChangeCapabilities> {
    const allowed = await this.allows(person, ticketId);
    return { canEdit: allowed ? allowed("edit") : false, canDelete: allowed ? allowed("delete") : false };
  }

  /** Null when the task doesn't exist. */
  private async allows(person: TaskChanger, ticketId: string): Promise<((change: TaskChange) => boolean) | null> {
    if (person.role === "admin") return () => true;
    const projectId = await this.deps.owners.projectIdForTask(ticketId);
    if (!projectId) return null;
    const [spaceRole, participants] = await Promise.all([
      this.deps.members.getRole(projectId, person.id),
      this.deps.participants.list(ticketId),
    ]);
    return (change) => canChangeTask(change, { userId: person.id, workspaceRole: person.role, spaceRole }, participants);
  }
}
