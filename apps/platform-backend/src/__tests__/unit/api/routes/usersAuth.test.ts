const adminRoleMiddleware = jest.fn();
const requireRoleMock = jest.fn(() => adminRoleMiddleware);
const requireAuthMock = jest.fn();

const listUsers = jest.fn();

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: requireAuthMock,
  requireRole: requireRoleMock,
}));

jest.mock("../../../../persistence/user/UserDAO", () => ({
  UserDAO: jest.fn().mockImplementation(() => ({ listUsers })),
}));

import usersRouter from "../../../../api/routes/users";

function getRouteHandlers(path: string, method: string): Array<(...args: unknown[]) => unknown> {
  const layer = (usersRouter as any).stack.find(
    (entry: any) =>
      entry.route &&
      entry.route.path === path &&
      entry.route.methods?.[method.toLowerCase()] === true,
  );

  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  return layer.route.stack.map((entry: any) => entry.handle);
}

describe("users route auth boundaries", () => {
  it("requires admin role on all user management endpoints", () => {
    expect(requireRoleMock).toHaveBeenCalledTimes(6);
    for (const call of requireRoleMock.mock.calls) expect(call).toEqual(["admin"]);

    expect(getRouteHandlers("/", "get")).toContain(adminRoleMiddleware);
    expect(getRouteHandlers("/:id/role", "patch")).toContain(adminRoleMiddleware);
    expect(getRouteHandlers("/", "post")).toContain(adminRoleMiddleware);
    expect(getRouteHandlers("/:id/deactivate", "post")).toContain(adminRoleMiddleware);
    expect(getRouteHandlers("/:id/reactivate", "post")).toContain(adminRoleMiddleware);
    expect(getRouteHandlers("/:id/reset-link", "post")).toContain(adminRoleMiddleware);
  });

  it("lets any signed-in user read the people directory", () => {
    const handlers = getRouteHandlers("/directory", "get");
    expect(handlers).toContain(requireAuthMock);
    expect(handlers).not.toContain(adminRoleMiddleware);
  });

  it.each([
    ["admin", "quinn@example.com"],
    ["member", "quinn@example.com"],
    ["guest", null],
    ["viewer", null],
  ])("directory email for a %s caller is %s", async (role, email) => {
    listUsers.mockResolvedValue([{ id: "u-1", email: "quinn@example.com", name: "Quinn", avatarUrl: null, role: "member" }]);
    const handler = getRouteHandlers("/directory", "get").at(-1)!;
    const res = { json: jest.fn(), status: jest.fn() };
    await handler({ authContext: { user: { role } } }, res);
    expect(res.json).toHaveBeenCalledWith({ people: [{ id: "u-1", email, name: "Quinn", avatarUrl: null }] });
  });
});
