import { createSingleUseToken, hashPassword, hashToken } from "../../api/auth/utils";
import { PasswordResetLinkDAO, type OpenResetLink } from "../../persistence/user/PasswordResetLinkDAO";
import { UserDAO, type PublicUser } from "../../persistence/user/UserDAO";
import { PEOPLE_SERVICE_ERROR_CODE, PeopleServiceError } from "../errors/PeopleServiceError";

const RESET_TTL_MS = 24 * 60 * 60 * 1000;

const LINK_INVALID_MESSAGE = "This reset link has expired or was already used. Ask an admin for a new one.";

type ResetLinkStore = Pick<PasswordResetLinkDAO, "create" | "findOpen" | "resetPassword">;
type UserLookup = Pick<UserDAO, "findById">;

/** Reset links an admin hands out, so a forgotten password needs no SMTP. */
export class PasswordResetService {
  constructor(
    private readonly links: ResetLinkStore = new PasswordResetLinkDAO(),
    private readonly users: UserLookup = new UserDAO(),
  ) {}

  async createLink(userId: string, createdBy: string): Promise<string> {
    const user = await this.users.findById(userId);
    if (!user) throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.USER_NOT_FOUND, "That person no longer exists.");
    if (user.deactivatedAt) {
      throw new PeopleServiceError(
        PEOPLE_SERVICE_ERROR_CODE.USER_DEACTIVATED,
        `${user.name} is deactivated. Reactivate them before sending a reset link.`,
      );
    }
    const { token, tokenHash, expiresAt } = createSingleUseToken(RESET_TTL_MS);
    await this.links.create({ userId, tokenHash, expiresAt, createdBy });
    return token;
  }

  async preview(token: string): Promise<OpenResetLink> {
    const link = await this.links.findOpen(hashToken(token));
    if (!link) throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.LINK_INVALID, LINK_INVALID_MESSAGE);
    return link;
  }

  /** Sets the new password and ends every other session of that person. */
  async reset(token: string, password: string): Promise<PublicUser> {
    const reset = await this.links.resetPassword(hashToken(token), await hashPassword(password));
    if (!reset) throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.LINK_INVALID, LINK_INVALID_MESSAGE);
    const user = await this.users.findById(reset.userId);
    if (!user) throw new Error(`User ${reset.userId} disappeared after a password reset`);
    return user;
  }
}
