import type { AppAccessAddition, AppAccessList } from "@viberglass/types";
import { normalizeEmail } from "../../api/auth/utils";
import type { AppAccessDAO } from "../../persistence/apps/AppAccessDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { InviteDAO } from "../../persistence/user/InviteDAO";
import type { UserDAO } from "../../persistence/user/UserDAO";
import type { InviteEmails } from "../people/InviteEmails";
import type { InviteService } from "../people/InviteService";
import { AppSpaceError } from "./AppSpaceError";

interface Dependencies {
  spaces: Pick<AppSpaceDAO, "findById">;
  accessList: Pick<AppAccessDAO, "list" | "add" | "remove">;
  users: Pick<UserDAO, "findByEmail">;
  openInvites: Pick<InviteDAO, "findOpenByEmail" | "listOpenForApp" | "addApp" | "removeApp" | "revoke">;
  invites: Pick<InviteService, "create">;
  emails: Pick<InviteEmails, "send">;
}

export interface AccessListActor {
  id: string;
  name: string;
}

/** An app's access list as its maintainers manage it. Who may manage it is checked by the route. */
export class AppAccessListService {
  constructor(private readonly deps: Dependencies) {}

  async list(projectId: string): Promise<AppAccessList> {
    const [people, invites] = await Promise.all([this.deps.accessList.list(projectId), this.deps.openInvites.listOpenForApp(projectId)]);
    return {
      people,
      invites: invites.map((invite) => ({ inviteId: invite.id, email: invite.email, expiresAt: invite.expiresAt.toISOString() })),
    };
  }

  /**
   * Gives someone the app by email. Someone with an account goes on the list;
   * someone with an open invite gets the app added to it, so it isn't replaced;
   * anyone else is invited as an app user.
   */
  async add(projectId: string, rawEmail: string, actor: AccessListActor): Promise<AppAccessAddition> {
    const space = await this.deps.spaces.findById(projectId);
    if (!space) throw new AppSpaceError("NOT_AN_APP_SPACE", "This space has no app.");
    const email = normalizeEmail(rawEmail);

    const user = await this.deps.users.findByEmail(email);
    if (user) {
      if (user.deactivatedAt) throw new AppSpaceError("PERSON_DEACTIVATED", `${user.name}'s account is deactivated. Ask an administrator.`);
      await this.deps.accessList.add({ projectId, userId: user.id, addedBy: actor.id });
      return { kind: "added", list: await this.list(projectId) };
    }

    const open = await this.deps.openInvites.findOpenByEmail(email);
    if (open && (await this.deps.openInvites.addApp(open.id, projectId))) {
      return { kind: "added_to_invite", list: await this.list(projectId) };
    }

    const { token } = await this.deps.invites.create({ email, role: "app_user", spaceIds: [], appIds: [projectId], createdBy: actor.id });
    const invitePath = `/invite/${token}`;
    const emailed = await this.deps.emails.send({ to: email, path: invitePath, inviterName: actor.name, appName: space.name });
    return { kind: "invited", list: await this.list(projectId), invitePath, emailed };
  }

  async remove(projectId: string, userId: string): Promise<AppAccessList> {
    if (!(await this.deps.accessList.remove(projectId, userId))) {
      throw new AppSpaceError("ACCESS_NOT_FOUND", "That person isn't on this app's access list.");
    }
    return this.list(projectId);
  }

  /** Takes the app off an invite; an app user's invite with no apps left is revoked. */
  async cancelInvite(projectId: string, inviteId: string): Promise<AppAccessList> {
    const invite = await this.deps.openInvites.removeApp(inviteId, projectId);
    if (!invite) throw new AppSpaceError("ACCESS_NOT_FOUND", "That invite is no longer open.");
    if (invite.role === "app_user" && invite.appIds.length === 0) await this.deps.openInvites.revoke(invite.id);
    return this.list(projectId);
  }
}
