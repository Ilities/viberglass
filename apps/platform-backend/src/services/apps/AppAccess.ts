import { canSeeSpace, SPACE_MEMBER_ROLES, type WorkspaceRole } from "@viberglass/types";
import type { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import type { AppAccessDAO } from "../../persistence/apps/AppAccessDAO";
import type { AppSpaceRef } from "../../persistence/apps/AppSpaceDAO";

/** Who may open an app, and who to ask when it's off. */
export class AppAccess {
  constructor(
    private readonly members: Pick<SpaceMemberDAO, "getRole" | "listMembers">,
    private readonly accessList: Pick<AppAccessDAO, "has">,
  ) {}

  /** Everyone who sees the App space may open its app, and so may the people on its access list. */
  async canOpen(user: { id: string; role: WorkspaceRole }, space: Pick<AppSpaceRef, "projectId" | "isPrivate">): Promise<boolean> {
    if (await this.canSeeSpace(user, space)) return true;
    return this.accessList.has(space.projectId, user.id);
  }

  /** Previews are for the people who see the space's tasks; the access list doesn't reach them. */
  async canSeeSpace(user: { id: string; role: WorkspaceRole }, space: Pick<AppSpaceRef, "projectId" | "isPrivate">): Promise<boolean> {
    return canSeeSpace(user.role, { isPrivate: space.isPrivate }, await this.members.getRole(space.projectId, user.id));
  }

  /** The people who can turn the app on, besides workspace admins. */
  async maintainerNames(projectId: string): Promise<string[]> {
    const members = await this.members.listMembers(projectId);
    return members
      .filter((member) => member.role === "maintainer" && SPACE_MEMBER_ROLES.includes(member.workspaceRole))
      .map((member) => member.name);
  }
}
