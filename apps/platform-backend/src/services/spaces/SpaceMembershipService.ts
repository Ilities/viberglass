import type { SpaceMember, SpaceRole } from "@viberglass/types";
import { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { SPACE_ACCESS_ERROR_CODE, SpaceAccessError } from "../errors/SpaceAccessError";

type MemberStore = Pick<SpaceMemberDAO, "listMembers" | "upsert" | "remove">;
type UserLookup = Pick<UserDAO, "findById">;

/** A space's members and their roles. Who may change them is checked by the space guard. */
export class SpaceMembershipService {
  constructor(
    private readonly members: MemberStore = new SpaceMemberDAO(),
    private readonly users: UserLookup = new UserDAO(),
  ) {}

  list(projectId: string): Promise<SpaceMember[]> {
    return this.members.listMembers(projectId);
  }

  async setRole(input: { projectId: string; userId: string; role: SpaceRole; actorId: string }): Promise<SpaceMember[]> {
    const user = await this.users.findById(input.userId);
    if (!user || user.deactivatedAt) {
      throw new SpaceAccessError(SPACE_ACCESS_ERROR_CODE.USER_NOT_FOUND, "That person isn't an active member of this workspace.");
    }
    await this.members.upsert({ projectId: input.projectId, userId: input.userId, role: input.role, addedBy: input.actorId });
    return this.members.listMembers(input.projectId);
  }

  async remove(projectId: string, userId: string): Promise<SpaceMember[]> {
    if (!(await this.members.remove(projectId, userId))) {
      throw new SpaceAccessError(SPACE_ACCESS_ERROR_CODE.MEMBER_NOT_FOUND, "That person isn't a member of this space.");
    }
    return this.members.listMembers(projectId);
  }
}
