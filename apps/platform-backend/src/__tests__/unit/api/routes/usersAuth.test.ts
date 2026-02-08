const adminRoleMiddleware = jest.fn();
const requireRoleMock = jest.fn(() => adminRoleMiddleware);

jest.mock("../../../../api/middleware/authentication", () => ({
  requireRole: requireRoleMock,
}));

import usersRouter from "../../../../api/routes/users";

function getRouteHandlers(path: string, method: string): Array<Function> {
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
    expect(requireRoleMock).toHaveBeenCalledTimes(3);
    expect(requireRoleMock).toHaveBeenNthCalledWith(1, "admin");
    expect(requireRoleMock).toHaveBeenNthCalledWith(2, "admin");
    expect(requireRoleMock).toHaveBeenNthCalledWith(3, "admin");

    expect(getRouteHandlers("/", "get")).toContain(adminRoleMiddleware);
    expect(getRouteHandlers("/:id/role", "patch")).toContain(adminRoleMiddleware);
    expect(getRouteHandlers("/", "post")).toContain(adminRoleMiddleware);
  });
});
