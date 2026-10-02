import { canAskAgent, canAskForCode, type TaskAskCapabilities, type TaskTurnAction } from "@viberglass/types";
import { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { TASK_ASK_POLICY_ERROR_CODE, TaskAskPolicyError } from "../errors/TaskAskPolicyError";
import { TICKET_SERVICE_ERROR_CODE, TicketServiceError } from "../errors/TicketServiceError";
import { SpaceAccessService, type SpaceViewer } from "../spaces/SpaceAccessService";

interface Dependencies {
  users: Pick<UserDAO, "findById">;
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask">;
  members: Pick<SpaceMemberDAO, "getRole">;
  access: Pick<SpaceAccessService, "assertCanSee">;
  participants: Pick<TaskParticipantDAO, "list">;
}

const NO_CAPABILITIES: TaskAskCapabilities = { canPost: false, canAsk: false, canAskForCode: false };

/**
 * The one place that decides who may ask the agent for what on a task.
 * Agreement replaced the approval gates; the one rule left is who may ask for
 * code.
 */
export class TaskAskPolicyService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      users: new UserDAO(),
      owners: new SpaceOwnershipDAO(),
      members: new SpaceMemberDAO(),
      access: new SpaceAccessService(),
      participants: new TaskParticipantDAO(),
      ...deps,
    };
  }

  async describe(userId: string, ticketId: string): Promise<TaskAskCapabilities> {
    const projectId = await this.deps.owners.projectIdForTask(ticketId);
    if (!projectId) throw new TicketServiceError(TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND, "Ticket not found");
    const [user, spaceRole, participants] = await Promise.all([
      this.deps.users.findById(userId),
      this.deps.members.getRole(projectId, userId),
      this.deps.participants.list(ticketId),
    ]);
    if (!user || user.deactivatedAt || !(await this.canSee({ id: user.id, role: user.role }, projectId))) return NO_CAPABILITIES;
    const person = { userId, workspaceRole: user.role, spaceRole };
    return {
      canPost: user.role !== "viewer",
      canAsk: canAskAgent(person, participants),
      canAskForCode: canAskForCode(person, participants),
    };
  }

  /**
   * Refuses with a reason the UI and Slack show as is. A null person is the
   * system, or Slack with no linked account: it may ask for anything but code,
   * which has to be credited to someone.
   */
  async assertCanAsk(userId: string | null, ticketId: string, action: TaskTurnAction): Promise<void> {
    const wantsCode = action === "code";
    if (!userId) {
      if (!wantsCode) return;
      throw new TaskAskPolicyError(
        TASK_ASK_POLICY_ERROR_CODE.NO_PERSON,
        "Asking the agent to build needs a signed-in person, so it can be credited to them.",
      );
    }
    const capabilities = await this.describe(userId, ticketId);
    if (wantsCode ? capabilities.canAskForCode : capabilities.canAsk) return;
    throw new TaskAskPolicyError(
      TASK_ASK_POLICY_ERROR_CODE.NOT_ALLOWED,
      wantsCode
        ? "Only the task's people, this space's maintainers or a workspace admin can ask the agent to build. Ask one of them, or ask to be added to the task."
        : "Only people on this task can ask the agent. Ask to be added to it.",
    );
  }

  /** Slack asks arrive without the space guard routes have, so visibility is checked here too. */
  private async canSee(viewer: SpaceViewer, projectId: string): Promise<boolean> {
    try {
      await this.deps.access.assertCanSee(viewer, projectId);
      return true;
    } catch {
      return false;
    }
  }
}
