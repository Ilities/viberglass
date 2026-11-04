import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { UserDAO, type PublicUser } from "../../persistence/user/UserDAO";
import { SpaceAccessService } from "../spaces/SpaceAccessService";

interface Dependencies {
  users: Pick<UserDAO, "findById">;
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask">;
  access: Pick<SpaceAccessService, "assertCanSee">;
}

/** Whether a person can see a task: an active account that can see its space. */
export class TaskVisibility {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { users: new UserDAO(), owners: new SpaceOwnershipDAO(), access: new SpaceAccessService(), ...deps };
  }

  /** The person, when they can see the space; null otherwise. */
  async inSpace(projectId: string, userId: string): Promise<PublicUser | null> {
    const user = await this.deps.users.findById(userId);
    if (!user || user.deactivatedAt) return null;
    try {
      await this.deps.access.assertCanSee({ id: user.id, role: user.role }, projectId);
      return user;
    } catch {
      return null;
    }
  }

  async onTask(ticketId: string, userId: string): Promise<PublicUser | null> {
    const projectId = await this.deps.owners.projectIdForTask(ticketId);
    return projectId ? this.inSpace(projectId, userId) : null;
  }
}
