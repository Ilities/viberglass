import { InviteService } from "../../../../services/people/InviteService";
import { hashToken } from "../../../../api/auth/utils";
import type { InviteRecord } from "../../../../persistence/user/InviteDAO";
import type { PublicUser } from "../../../../persistence/user/UserDAO";

const at = new Date("2026-09-30T10:00:00Z");

const invite: InviteRecord = {
  id: "invite-1",
  email: "maria@example.com",
  role: "member",
  spaceIds: [],
  invitedByName: "Jussi",
  createdAt: at,
  expiresAt: new Date("2026-10-07T10:00:00Z"),
};

const maria: PublicUser = {
  id: "user-2",
  email: "maria@example.com",
  name: "Maria",
  avatarUrl: null,
  role: "member",
  createdAt: at,
  updatedAt: at,
  deactivatedAt: null,
};

function setup() {
  const invites = {
    create: jest.fn().mockResolvedValue(invite),
    listOpen: jest.fn().mockResolvedValue([invite]),
    findOpenByTokenHash: jest.fn().mockResolvedValue(invite),
    revoke: jest.fn().mockResolvedValue(true),
    accept: jest.fn().mockResolvedValue({ userId: "user-2" }),
  };
  const users = {
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(maria),
  };
  const spaces = { getProject: jest.fn(async (id: string) => (id === "space-gone" ? null : { id })) };
  return { invites, users, spaces, service: new InviteService(invites, users, spaces) };
}

describe("InviteService", () => {
  it("stores only the token's hash and returns the token once", async () => {
    const { invites, service } = setup();

    const { token } = await service.create({ email: " Maria@Example.com ", role: "member", spaceIds: [], createdBy: "user-1" });

    expect(invites.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "maria@example.com", role: "member", tokenHash: hashToken(token), createdBy: "user-1" }),
    );
    const { expiresAt } = invites.create.mock.calls[0][0];
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });

  it("refuses an email that already has an account", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(maria);

    await expect(service.create({ email: "maria@example.com", role: "member", spaceIds: [], createdBy: "user-1" })).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
      statusCode: 409,
    });
  });

  it("invites a guest only into named spaces", async () => {
    const { invites, service } = setup();

    await expect(service.create({ email: "g@example.com", role: "guest", spaceIds: [], createdBy: "user-1" })).rejects.toMatchObject({
      code: "GUEST_NEEDS_SPACE",
    });
    await service.create({ email: "g@example.com", role: "guest", spaceIds: ["space-1"], createdBy: "user-1" });
    expect(invites.create).toHaveBeenCalledWith(expect.objectContaining({ role: "guest", spaceIds: ["space-1"] }));
  });

  it("refuses a space that no longer exists", async () => {
    const { service } = setup();

    await expect(
      service.create({ email: "g@example.com", role: "member", spaceIds: ["space-gone"], createdBy: "user-1" }),
    ).rejects.toMatchObject({ code: "SPACE_NOT_FOUND" });
  });

  it("refuses a link that is no longer open", async () => {
    const { invites, service } = setup();
    invites.findOpenByTokenHash.mockResolvedValue(null);

    await expect(service.preview("used-token")).rejects.toMatchObject({ code: "LINK_INVALID", statusCode: 404 });
  });

  it("creates the account from the invite", async () => {
    const { invites, service } = setup();

    await expect(service.accept("token", { name: " Maria ", password: "long-enough" })).resolves.toBe(maria);

    expect(invites.accept).toHaveBeenCalledWith(hashToken("token"), expect.objectContaining({ name: "Maria" }));
  });

  it("refuses a second use of the same link", async () => {
    const { invites, service } = setup();
    invites.accept.mockResolvedValue(null);

    await expect(service.accept("token", { name: "Maria", password: "long-enough" })).rejects.toMatchObject({
      code: "LINK_INVALID",
    });
  });

  it("says when a revoked invite can't be revoked again", async () => {
    const { invites, service } = setup();
    invites.revoke.mockResolvedValue(false);

    await expect(service.revoke("invite-1")).rejects.toMatchObject({ code: "INVITE_NOT_FOUND" });
  });
});
