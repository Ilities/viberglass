import { canSeeSpace, type WorkspaceRole } from "@viberglass/types";
import type { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import type { AppSpaceRef } from "../../persistence/apps/AppSpaceDAO";

/** Who may open an app, and who to ask when it's off. */
export class AppAccess {
  constructor(private readonly members: Pick<SpaceMemberDAO, "getRole" | "listMembers">) {}

  /** Everyone who sees the App space may open its app. */
  async canOpen(user: { id: string; role: WorkspaceRole }, space: Pick<AppSpaceRef, "projectId" | "isPrivate">): Promise<boolean> {
    return canSeeSpace(user.role, { isPrivate: space.isPrivate }, await this.members.getRole(space.projectId, user.id));
  }

  /** The people who can turn the app on, besides workspace admins. */
  async maintainerNames(projectId: string): Promise<string[]> {
    const members = await this.members.listMembers(projectId);
    return members.filter((member) => member.role === "maintainer").map((member) => member.name);
  }
}
