import { UserDAO, type PublicUser } from "../../persistence/user/UserDAO";
import { PEOPLE_SERVICE_ERROR_CODE, PeopleServiceError } from "../errors/PeopleServiceError";

type UserStore = Pick<UserDAO, "findById" | "setDeactivated" | "countActiveAdmins">;

/** Deactivating keeps a person's name on what they did, and stops their access at once. */
export class UserActivationService {
  constructor(private readonly users: UserStore = new UserDAO()) {}

  async deactivate(userId: string, actorId: string): Promise<PublicUser> {
    if (userId === actorId) {
      throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.CANNOT_DEACTIVATE_SELF, "You can't deactivate yourself.");
    }
    const user = await this.users.findById(userId);
    if (!user) throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.USER_NOT_FOUND, "That person no longer exists.");
    if (user.role === "admin" && !user.deactivatedAt && (await this.users.countActiveAdmins()) <= 1) {
      throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.LAST_ADMIN, "At least one active admin is required.");
    }
    return this.set(userId, true);
  }

  reactivate(userId: string): Promise<PublicUser> {
    return this.set(userId, false);
  }

  private async set(userId: string, deactivated: boolean): Promise<PublicUser> {
    const user = await this.users.setDeactivated(userId, deactivated);
    if (!user) throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.USER_NOT_FOUND, "That person no longer exists.");
    return user;
  }
}
