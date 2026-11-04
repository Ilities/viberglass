import { UserRoleService } from "../../../../services/people/UserRoleService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const at = new Date("2026-11-04T10:00:00Z");
const user = (role: "member" | "app_user") => ({ id: "user-2", email: "k@example.com", name: "Kim", avatarUrl: null, role, createdAt: at, updatedAt: at, deactivatedAt: null });

function build() {
  const users = { updateUserRole: jest.fn(async (_id: string, role: "member" | "app_user") => user(role)) };
  const taskSideAccess = { removeFor: jest.fn(async () => undefined) };
  return { users, taskSideAccess, service: new UserRoleService(users, taskSideAccess) };
}

describe("UserRoleService", () => {
  it("takes a new app user out of spaces and tasks", async () => {
    const { taskSideAccess, service } = build();

    await expect(service.setRole("user-2", "app_user")).resolves.toMatchObject({ role: "app_user" });
    expect(taskSideAccess.removeFor).toHaveBeenCalledWith("user-2");
  });

  it("leaves everything else in place for other roles", async () => {
    const { taskSideAccess, service } = build();

    await service.setRole("user-2", "member");
    expect(taskSideAccess.removeFor).not.toHaveBeenCalled();
  });
});
