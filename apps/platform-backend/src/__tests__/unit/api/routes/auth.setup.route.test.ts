const mockUserDao = {
  hasAnyUsers: jest.fn(),
  createInitialAdmin: jest.fn(),
};

const mockSessionDao = {
  createSession: jest.fn(),
};

const mockSetAuthCookie = jest.fn();

jest.mock("../../../../persistence/user/UserDAO", () => ({
  UserDAO: jest.fn(() => mockUserDao),
}));

jest.mock("../../../../persistence/user/UserSessionDAO", () => ({
  UserSessionDAO: jest.fn(() => mockSessionDao),
}));

jest.mock("../../../../api/middleware/validation", () => ({
  validateForgotPassword: jest.fn(),
  validateLogin: jest.fn(),
  validateRegister: jest.fn(),
}));

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("../../../../api/auth/config", () => ({
  isAuthEnabled: jest.fn(() => true),
}));

jest.mock("../../../../api/auth/utils", () => ({
  clearAuthCookie: jest.fn(),
  createSessionToken: jest.fn(() => ({
    token: "session-token",
    tokenHash: "session-hash",
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
  })),
  getAuthToken: jest.fn(),
  hashPassword: jest.fn(() => Promise.resolve("password-hash")),
  hashToken: jest.fn(),
  normalizeEmail: jest.fn((email: string) => email.trim().toLowerCase()),
  setAuthCookie: mockSetAuthCookie,
}));

jest.mock("passport", () => ({
  __esModule: true,
  default: { authenticate: jest.fn() },
}));

import authRouter from "../../../../api/routes/auth";

function getRouteHandler(path: string, method: string): unknown {
  const layer = authRouter.stack.find(
    (entry) =>
      entry.route &&
      entry.route.path === path &&
      Reflect.get(entry.route, "methods")?.[method.toLowerCase()] === true,
  );

  if (!layer?.route)
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);

  const stack = Reflect.get(layer.route, "stack");
  return stack[stack.length - 1].handle;
}

function buildResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("initial user authentication setup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDao.hasAnyUsers.mockResolvedValue(false);
  });

  it("reports that initial setup is required when there are no users", async () => {
    mockUserDao.hasAnyUsers.mockResolvedValue(false);
    const handler = getRouteHandler("/setup-status", "get");
    if (typeof handler !== "function")
      throw new Error("Route handler was not a function");
    const res = buildResponse();

    await handler({}, res);

    expect(res.json).toHaveBeenCalledWith({ requiresInitialUser: true });
  });

  it("creates the initial administrator and signs them in", async () => {
    const user = {
      id: "user-1",
      email: "admin@example.com",
      name: "Initial Admin",
      avatarUrl: null,
      role: "admin",
    };
    mockUserDao.createInitialAdmin.mockResolvedValue(user);
    const handler = getRouteHandler("/register", "post");
    if (typeof handler !== "function")
      throw new Error("Route handler was not a function");
    const res = buildResponse();

    await handler(
      {
        body: {
          email: " Admin@Example.com ",
          name: " Initial Admin ",
          password: "secure-password",
        },
      },
      res,
    );

    expect(mockUserDao.createInitialAdmin).toHaveBeenCalledWith({
      email: "admin@example.com",
      name: "Initial Admin",
      passwordHash: "password-hash",
    });
    expect(mockSessionDao.createSession).toHaveBeenCalledWith({
      userId: "user-1",
      tokenHash: "session-hash",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    expect(mockSetAuthCookie).toHaveBeenCalledWith(res, "session-token");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects a bootstrap request after another user wins the setup race", async () => {
    mockUserDao.createInitialAdmin.mockResolvedValue(null);
    const handler = getRouteHandler("/register", "post");
    if (typeof handler !== "function")
      throw new Error("Route handler was not a function");
    const res = buildResponse();

    await handler(
      {
        body: {
          email: "admin@example.com",
          name: "Initial Admin",
          password: "secure-password",
        },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Initial setup has already been completed",
      message: "Sign in or ask an administrator to create your account.",
    });
    expect(mockSessionDao.createSession).not.toHaveBeenCalled();
  });
});
