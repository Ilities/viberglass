import {
  canApproveStep,
  namedApprovers,
  type ApprovalStep,
  type StepApproval,
  type TaskApprovals,
  type TaskParticipant,
} from "@viberglass/types";
import { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { APPROVAL_POLICY_ERROR_CODE, ApprovalPolicyError } from "../errors/ApprovalPolicyError";
import { TICKET_SERVICE_ERROR_CODE, TicketServiceError } from "../errors/TicketServiceError";
import { SpaceAccessService, type SpaceViewer } from "../spaces/SpaceAccessService";

interface Dependencies {
  users: Pick<UserDAO, "findById">;
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask">;
  members: Pick<SpaceMemberDAO, "getRole">;
  access: Pick<SpaceAccessService, "assertCanSee">;
  participants: Pick<TaskParticipantDAO, "list">;
}

const STEP_NOUN: Record<ApprovalStep, string> = { research: "the research", planning: "the plan" };

/**
 * The one place that decides who may approve a task's research and plan (D4).
 * Every path that approves, or skips past an approval, asks it first.
 */
export class ApprovalPolicyService {
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

  /** Each step's approval as this person sees it, for the task page. */
  async describe(userId: string, ticketId: string): Promise<TaskApprovals> {
    const { participants, allows } = await this.evaluate(userId, ticketId);
    const describeStep = (step: ApprovalStep): StepApproval => ({
      canApprove: allows(step),
      approvers: approversOf(step, participants),
    });
    return { research: describeStep("research"), planning: describeStep("planning") };
  }

  /** Refuses with a reason the UI and Slack show as is. A null person is the system, or Slack with no linked account. */
  async assertCanApprove(userId: string | null, ticketId: string, step: ApprovalStep): Promise<void> {
    if (!userId) {
      throw new ApprovalPolicyError(
        APPROVAL_POLICY_ERROR_CODE.NO_PERSON,
        `Approving ${STEP_NOUN[step]} needs a signed-in person, so it can be credited to them.`,
      );
    }
    const { participants, allows } = await this.evaluate(userId, ticketId);
    if (allows(step)) return;
    const names = approversOf(step, participants).map((person) => person.name);
    const named = names.length > 0 ? `${names.join(", ")}, this space's maintainers or a workspace admin` : "this space's maintainers or a workspace admin";
    throw new ApprovalPolicyError(
      APPROVAL_POLICY_ERROR_CODE.NOT_ELIGIBLE,
      `Only ${named} can approve ${STEP_NOUN[step]}. Ask one of them, or add yourself as a reviewer.`,
    );
  }

  private async evaluate(userId: string, ticketId: string) {
    const projectId = await this.deps.owners.projectIdForTask(ticketId);
    if (!projectId) throw new TicketServiceError(TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND, "Ticket not found");
    const [user, spaceRole, participants] = await Promise.all([
      this.deps.users.findById(userId),
      this.deps.members.getRole(projectId, userId),
      this.deps.participants.list(ticketId),
    ]);
    const canSee = user && !user.deactivatedAt ? await this.canSee({ id: user.id, role: user.role }, projectId) : false;
    const allows = (step: ApprovalStep): boolean =>
      canSee && user !== null && canApproveStep(step, { userId, workspaceRole: user.role, spaceRole }, participants);
    return { participants, allows };
  }

  /** Slack approvals arrive without the space guard routes have, so visibility is checked here too. */
  private async canSee(viewer: SpaceViewer, projectId: string): Promise<boolean> {
    try {
      await this.deps.access.assertCanSee(viewer, projectId);
      return true;
    } catch {
      return false;
    }
  }
}

function approversOf(step: ApprovalStep, participants: TaskParticipant[]): StepApproval["approvers"] {
  const ids = namedApprovers(step, participants);
  return ids.flatMap((id) => {
    const person = participants.find((p) => p.userId === id);
    return person ? [{ id, name: person.name }] : [];
  });
}
