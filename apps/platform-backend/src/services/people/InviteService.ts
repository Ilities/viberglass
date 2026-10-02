import type { WorkspaceRole } from "@viberglass/types";
import { createSingleUseToken, hashPassword, hashToken, normalizeEmail } from "../../api/auth/utils";
import { InviteDAO, type InviteRecord } from "../../persistence/user/InviteDAO";
import { UserDAO, type PublicUser } from "../../persistence/user/UserDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { PEOPLE_SERVICE_ERROR_CODE, PeopleServiceError } from "../errors/PeopleServiceError";
import { AuditRecorder } from "../audit/AuditRecorder";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const LINK_INVALID_MESSAGE = "This invite link has expired, was revoked or was already used. Ask for a new one.";

type InviteStore = Pick<InviteDAO, "create" | "listOpen" | "findOpenByTokenHash" | "revoke" | "accept">;
type UserLookup = Pick<UserDAO, "findByEmail" | "findById">;
type SpaceLookup = { getProject(id: string): Promise<{ id: string } | null> };

/** Invite links: made by an admin, shown once, used once. */
export class InviteService {
  constructor(
    private readonly invites: InviteStore = new InviteDAO(),
    private readonly users: UserLookup = new UserDAO(),
    private readonly spaces: SpaceLookup = new ProjectDAO(),
    private readonly audit: Pick<AuditRecorder, "record"> = new AuditRecorder(),
  ) {}

  /** `spaceIds` are spaces the invitee joins on accepting; a guest needs at least one. */
  async create(input: { email: string; role: WorkspaceRole; spaceIds: string[]; createdBy: string }): Promise<{
    invite: InviteRecord;
    token: string;
  }> {
    if (input.role === "guest" && input.spaceIds.length === 0) {
      throw new PeopleServiceError(
        PEOPLE_SERVICE_ERROR_CODE.GUEST_NEEDS_SPACE,
        "Pick at least one space: a guest sees only the spaces they're invited to.",
      );
    }
    for (const spaceId of input.spaceIds) {
      if (!(await this.spaces.getProject(spaceId))) {
        throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.SPACE_NOT_FOUND, "One of the chosen spaces no longer exists.");
      }
    }
    const email = normalizeEmail(input.email);
    if (await this.users.findByEmail(email)) {
      throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.EMAIL_TAKEN, `${email} already has an account.`);
    }
    const { token, tokenHash, expiresAt } = createSingleUseToken(INVITE_TTL_MS);
    const invite = await this.invites.create({
      email,
      role: input.role,
      spaceIds: input.spaceIds,
      tokenHash,
      expiresAt,
      createdBy: input.createdBy,
    });
    return { invite, token };
  }

  listOpen(): Promise<InviteRecord[]> {
    return this.invites.listOpen();
  }

  async revoke(id: string): Promise<void> {
    if (!(await this.invites.revoke(id))) {
      throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.INVITE_NOT_FOUND, "That invite is no longer open.");
    }
  }

  /** What the invite page shows before someone accepts. */
  async preview(token: string): Promise<InviteRecord> {
    const invite = await this.invites.findOpenByTokenHash(hashToken(token));
    if (!invite) throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.LINK_INVALID, LINK_INVALID_MESSAGE);
    return invite;
  }

  async accept(token: string, input: { name: string; password: string }): Promise<PublicUser> {
    const invite = await this.preview(token);
    if (await this.users.findByEmail(invite.email)) {
      throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.EMAIL_TAKEN, `${invite.email} already has an account. Sign in instead.`);
    }
    const accepted = await this.invites.accept(hashToken(token), {
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
    });
    if (!accepted) throw new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.LINK_INVALID, LINK_INVALID_MESSAGE);
    const user = await this.users.findById(accepted.userId);
    if (!user) throw new Error(`User ${accepted.userId} disappeared after accepting an invite`);
    // Nobody is signed in yet, so the new person is the actor.
    await this.audit.record({
      action: "invite.accepted",
      target: { type: "invite", id: invite.id },
      actorId: user.id,
      details: { email: invite.email, role: invite.role },
    });
    return user;
  }
}
