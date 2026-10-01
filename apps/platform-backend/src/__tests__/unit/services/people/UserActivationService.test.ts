import { UserActivationService } from "../../../../services/people/UserActivationService";
import type { PublicUser } from "../../../../persistence/user/UserDAO";

const at = new Date("2026-09-30T10:00:00Z");
const person = (overrides: Partial<PublicUser>): PublicUser => ({
  id: "user-2",
  email: "maria@example.com",
  name: "Maria",
  avatarUrl: null,
  role: "member",
  createdAt: at,
  updatedAt: at,
  deactivatedAt: null,
  ...overrides,
});

function setup(target: PublicUser, activeAdmins = 2) {
  const users = {
    findById: jest.fn().mockResolvedValue(target),
    setDeactivated: jest.fn(async (_id: string, deactivated: boolean) => ({ ...target, deactivatedAt: deactivated ? at : null })),
    countActiveAdmins: jest.fn().mockResolvedValue(activeAdmins),
  };
  return { users, service: new UserActivationService(users) };
}

describe("UserActivationService", () => {
  it("deactivates a member", async () => {
    const { users, service } = setup(person({}));

    await expect(service.deactivate("user-2", "user-1")).resolves.toMatchObject({ deactivatedAt: at });
    expect(users.setDeactivated).toHaveBeenCalledWith("user-2", true);
  });

  it("won't let an admin deactivate themselves", async () => {
    const { service } = setup(person({ id: "user-1", role: "admin" }));

    await expect(service.deactivate("user-1", "user-1")).rejects.toMatchObject({ code: "CANNOT_DEACTIVATE_SELF" });
  });

  it("keeps at least one active admin", async () => {
    const { service } = setup(person({ role: "admin" }), 1);

    await expect(service.deactivate("user-2", "user-1")).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });

  it("reactivates", async () => {
    const { users, service } = setup(person({ deactivatedAt: at }));

    await expect(service.reactivate("user-2")).resolves.toMatchObject({ deactivatedAt: null });
    expect(users.setDeactivated).toHaveBeenCalledWith("user-2", false);
  });
});
