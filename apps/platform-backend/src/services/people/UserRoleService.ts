import type { WorkspaceRole } from "@viberglass/types";
import { TaskSideAccessDAO } from "../../persistence/user/TaskSideAccessDAO";
import { UserDAO, type PublicUser } from "../../persistence/user/UserDAO";

/** Changing someone's workspace role, and what goes with it. */
export class UserRoleService {
  constructor(
    private readonly users: Pick<UserDAO, "updateUserRole"> = new UserDAO(),
    private readonly taskSideAccess: Pick<TaskSideAccessDAO, "removeFor"> = new TaskSideAccessDAO(),
  ) {}

  /** An app user only opens apps, so their memberships, reviews, watches and API tokens go. */
  async setRole(userId: string, role: WorkspaceRole): Promise<PublicUser | null> {
    const user = await this.users.updateUserRole(userId, role);
    if (user && role === "app_user") await this.taskSideAccess.removeFor(userId);
    return user;
  }
}
