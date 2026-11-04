import type { AppAccessPerson } from "@viberglass/types";
import type { InviteRecord } from "../../../../persistence/user/InviteDAO";
import { AppAccessListService } from "../../../../services/apps/AppAccessListService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const at = new Date("2026-11-04T10:00:00Z");
const SPACE = { projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: false };
const ACTOR = { id: "maint-1", name: "Ada" };
const KIM: AppAccessPerson = { userId: "kim", name: "Kim", email: "kim@example.com", workspaceRole: "app_user", addedAt: at.toISOString() };

function invite(overrides: Partial<InviteRecord> = {}): InviteRecord {
  return {
    id: "invite-1",
    email: "lee@example.com",
    role: "app_user",
    spaceIds: [],
    appIds: ["space-1"],
    invitedByName: "Ada",
    createdAt: at,
    expiresAt: new Date("2026-11-11T10:00:00Z"),
    ...overrides,
  };
}

function setup(options: { user?: { id: string; name: string; deactivatedAt: Date | null } | null; openInvite?: InviteRecord | null } = {}) {
  const deps = {
    spaces: { findById: jest.fn(async (id: string) => (id === "space-1" ? SPACE : null)) },
    accessList: {
      list: jest.fn(async () => [KIM]),
      add: jest.fn(async () => undefined),
      remove: jest.fn(async () => true),
    },
    users: { findByEmail: jest.fn(async () => (options.user ? { ...options.user, email: "x", passwordHash: "", avatarUrl: null, role: "member" as const, createdAt: at, updatedAt: at } : null)) },
    openInvites: {
      findOpenByEmail: jest.fn(async () => options.openInvite ?? null),
      listOpenForApp: jest.fn(async () => [invite()]),
      addApp: jest.fn(async (): Promise<InviteRecord | null> => invite()),
      removeApp: jest.fn(async (): Promise<InviteRecord | null> => invite({ appIds: [] })),
      revoke: jest.fn(async () => true),
    },
    invites: { create: jest.fn(async () => ({ invite: invite(), token: "tok" })) },
    emails: { send: jest.fn(async () => true) },
  };
  return { deps, service: new AppAccessListService(deps) };
}

describe("AppAccessListService", () => {
  it("lists the people on the app's list and its open invites", async () => {
    const { service } = setup();

    await expect(service.list("space-1")).resolves.toEqual({
      people: [KIM],
      invites: [{ inviteId: "invite-1", email: "lee@example.com", expiresAt: "2026-11-11T10:00:00.000Z" }],
    });
  });

  it("puts someone with an account straight on the list", async () => {
    const { service, deps } = setup({ user: { id: "kim", name: "Kim", deactivatedAt: null } });

    const addition = await service.add("space-1", " Kim@Example.com ", ACTOR);

    expect(addition.kind).toBe("added");
    expect(deps.users.findByEmail).toHaveBeenCalledWith("kim@example.com");
    expect(deps.accessList.add).toHaveBeenCalledWith({ projectId: "space-1", userId: "kim", addedBy: "maint-1" });
    expect(deps.invites.create).not.toHaveBeenCalled();
  });

  it("refuses a deactivated account", async () => {
    const { service, deps } = setup({ user: { id: "kim", name: "Kim", deactivatedAt: at } });

    await expect(service.add("space-1", "kim@example.com", ACTOR)).rejects.toMatchObject({ code: "PERSON_DEACTIVATED" });
    expect(deps.accessList.add).not.toHaveBeenCalled();
  });

  it("adds the app to an open invite rather than replacing it", async () => {
    const { service, deps } = setup({ openInvite: invite({ id: "admin-invite", role: "member", appIds: [] }) });

    const addition = await service.add("space-1", "lee@example.com", ACTOR);

    expect(addition.kind).toBe("added_to_invite");
    expect(deps.openInvites.addApp).toHaveBeenCalledWith("admin-invite", "space-1");
    expect(deps.invites.create).not.toHaveBeenCalled();
  });

  it("invites anyone else as an app user of this app, and emails the link naming the app", async () => {
    const { service, deps } = setup();

    const addition = await service.add("space-1", "lee@example.com", ACTOR);

    expect(deps.invites.create).toHaveBeenCalledWith({ email: "lee@example.com", role: "app_user", spaceIds: [], appIds: ["space-1"], createdBy: "maint-1" });
    expect(deps.emails.send).toHaveBeenCalledWith({ to: "lee@example.com", path: "/invite/tok", inviterName: "Ada", appName: "Laptops" });
    expect(addition).toMatchObject({ kind: "invited", invitePath: "/invite/tok", emailed: true });
  });

  it("refuses a space that isn't an App space", async () => {
    await expect(setup().service.add("space-2", "lee@example.com", ACTOR)).rejects.toMatchObject({ code: "NOT_AN_APP_SPACE" });
  });

  it("says when the person wasn't on the list", async () => {
    const { service, deps } = setup();
    deps.accessList.remove.mockResolvedValue(false);

    await expect(service.remove("space-1", "kim")).rejects.toMatchObject({ code: "ACCESS_NOT_FOUND" });
  });

  it("revokes an app user's invite once it has no apps left", async () => {
    const { service, deps } = setup();

    await service.cancelInvite("space-1", "invite-1");

    expect(deps.openInvites.removeApp).toHaveBeenCalledWith("invite-1", "space-1");
    expect(deps.openInvites.revoke).toHaveBeenCalledWith("invite-1");
  });

  it("keeps an invite that still gives something else", async () => {
    const { service, deps } = setup();
    deps.openInvites.removeApp.mockResolvedValue(invite({ role: "member", appIds: [] }));
    await service.cancelInvite("space-1", "invite-1");
    deps.openInvites.removeApp.mockResolvedValue(invite({ appIds: ["space-9"] }));
    await service.cancelInvite("space-1", "invite-1");

    expect(deps.openInvites.revoke).not.toHaveBeenCalled();
  });

  it("refuses an invite that isn't open or isn't for this app", async () => {
    const { service, deps } = setup();
    deps.openInvites.removeApp.mockResolvedValue(null);

    await expect(service.cancelInvite("space-1", "invite-1")).rejects.toMatchObject({ code: "ACCESS_NOT_FOUND" });
  });
});
