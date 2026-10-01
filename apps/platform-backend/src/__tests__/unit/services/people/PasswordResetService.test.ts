import { PasswordResetService } from "../../../../services/people/PasswordResetService";
import { hashToken } from "../../../../api/auth/utils";
import type { PublicUser } from "../../../../persistence/user/UserDAO";

const at = new Date("2026-09-30T10:00:00Z");
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
  const links = {
    create: jest.fn().mockResolvedValue(undefined),
    findOpen: jest.fn().mockResolvedValue({ userId: "user-2", email: maria.email, name: maria.name }),
    resetPassword: jest.fn().mockResolvedValue({ userId: "user-2" }),
  };
  const users = { findById: jest.fn().mockResolvedValue(maria) };
  return { links, users, service: new PasswordResetService(links, users) };
}

describe("PasswordResetService", () => {
  it("makes a day-long link and stores only its hash", async () => {
    const { links, service } = setup();

    const token = await service.createLink("user-2", "user-1");

    const call = links.create.mock.calls[0][0];
    expect(call).toMatchObject({ userId: "user-2", tokenHash: hashToken(token), createdBy: "user-1" });
    expect(call.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("won't make a link for a deactivated person", async () => {
    const { users, service } = setup();
    users.findById.mockResolvedValue({ ...maria, deactivatedAt: at });

    await expect(service.createLink("user-2", "user-1")).rejects.toMatchObject({ code: "USER_DEACTIVATED" });
  });

  it("refuses a used or expired link", async () => {
    const { links, service } = setup();
    links.resetPassword.mockResolvedValue(null);

    await expect(service.reset("token", "new-password")).rejects.toMatchObject({ code: "LINK_INVALID" });
  });

  it("sets the new password through the link", async () => {
    const { links, service } = setup();

    await expect(service.reset("token", "new-password")).resolves.toBe(maria);
    expect(links.resetPassword).toHaveBeenCalledWith(hashToken("token"), expect.stringContaining(":"));
  });
});
