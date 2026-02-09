import { Response } from "express";
import {
  requireProjectAccess,
  requireProjectAdmin,
  requireTicketProjectAccess,
  type AuthenticatedRequest,
  userHasProjectAccess,
  getUserProjects,
} from "../../../../api/middleware/projectAuthorization";
import db from "../../../../persistence/config/database";

jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: {
    selectFrom: jest.fn(),
  },
}));

type MockResponse = {
  status: jest.Mock;
  json: jest.Mock;
  headersSent: boolean;
};

const mockDb = db as unknown as { selectFrom: jest.Mock };

function createResponse(): MockResponse {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));

  return {
    status,
    json,
    headersSent: false,
  };
}

function createRequest(
  overrides: Partial<AuthenticatedRequest> = {},
): AuthenticatedRequest {
  return {
    user: {
      id: "user-123",
      email: "test@example.com",
      tenant_id: "tenant-1",
      role: "member",
    },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as AuthenticatedRequest;
}

function createChainedSelect(result: unknown) {
  const executeTakeFirst = jest.fn().mockResolvedValue(result);
  let where: jest.Mock;
  where = jest.fn(() => ({ where, executeTakeFirst }));
  const select = jest.fn(() => ({ where }));
  return { select, executeTakeFirst };
}

describe("projectAuthorization middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("requireProjectAccess", () => {
    it("allows access when user belongs to project", async () => {
      const req = createRequest({ params: { projectId: "project-123" } as any });
      const res = createResponse();
      const next = jest.fn();

      const chain = createChainedSelect({
        project_id: "project-123",
        role: "member",
      });
      mockDb.selectFrom.mockReturnValue({ select: chain.select });

      await requireProjectAccess(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.projectAccess).toEqual({
        projectId: "project-123",
        role: "member",
      });
    });

    it("returns 401 when request is unauthenticated", async () => {
      const req = createRequest({ user: undefined });
      const res = createResponse();
      const next = jest.fn();

      await requireProjectAccess(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Unauthorized",
        message: "Authentication required",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 400 when project id is missing", async () => {
      const req = createRequest();
      const res = createResponse();
      const next = jest.fn();

      await requireProjectAccess(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Bad Request",
        message: "Project ID is required",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 when user is not member of project", async () => {
      const req = createRequest({ params: { projectId: "project-999" } as any });
      const res = createResponse();
      const next = jest.fn();

      const chain = createChainedSelect(undefined);
      mockDb.selectFrom.mockReturnValue({ select: chain.select });

      await requireProjectAccess(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden",
        message: "You do not have access to this project",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requireProjectAdmin", () => {
    it("allows admin users", async () => {
      const req = createRequest({ params: { projectId: "project-123" } as any });
      const res = createResponse();
      const next = jest.fn();

      const chain = createChainedSelect({
        project_id: "project-123",
        role: "admin",
      });
      mockDb.selectFrom.mockReturnValue({ select: chain.select });

      await requireProjectAdmin(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it("blocks non-admin users", async () => {
      const req = createRequest({ params: { projectId: "project-123" } as any });
      const res = createResponse();
      const next = jest.fn();

      const chain = createChainedSelect({
        project_id: "project-123",
        role: "member",
      });
      mockDb.selectFrom.mockReturnValue({ select: chain.select });

      await requireProjectAdmin(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden",
        message: "Admin access required for this operation",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requireTicketProjectAccess", () => {
    it("allows access when user can access ticket project", async () => {
      const req = createRequest({ params: { ticketId: "ticket-1" } as any });
      const res = createResponse();
      const next = jest.fn();

      const ticketChain = createChainedSelect({ project_id: "project-456" });
      const membershipChain = createChainedSelect({
        project_id: "project-456",
        role: "member",
      });

      mockDb.selectFrom
        .mockReturnValueOnce({ select: ticketChain.select })
        .mockReturnValueOnce({ select: membershipChain.select });

      await requireTicketProjectAccess(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.projectAccess).toEqual({
        projectId: "project-456",
        role: "member",
      });
    });

    it("returns 404 when ticket is missing", async () => {
      const req = createRequest({ params: { ticketId: "missing-ticket" } as any });
      const res = createResponse();
      const next = jest.fn();

      const ticketChain = createChainedSelect(undefined);
      mockDb.selectFrom.mockReturnValueOnce({ select: ticketChain.select });

      await requireTicketProjectAccess(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Not Found",
        message: "Ticket not found",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("helpers", () => {
    it("userHasProjectAccess returns true when membership exists", async () => {
      const chain = createChainedSelect({ id: "row-1" });
      mockDb.selectFrom.mockReturnValue({ select: chain.select });

      await expect(
        userHasProjectAccess("user-123", "project-123"),
      ).resolves.toBe(true);
    });

    it("userHasProjectAccess returns false when membership is missing", async () => {
      const chain = createChainedSelect(undefined);
      mockDb.selectFrom.mockReturnValue({ select: chain.select });

      await expect(
        userHasProjectAccess("user-123", "project-123"),
      ).resolves.toBe(false);
    });

    it("getUserProjects returns all projects", async () => {
      const projects = [
        { project_id: "project-1", role: "admin" },
        { project_id: "project-2", role: "member" },
      ];

      const execute = jest.fn().mockResolvedValue(projects);
      const where = jest.fn(() => ({ execute }));
      const select = jest.fn(() => ({ where }));
      mockDb.selectFrom.mockReturnValue({ select });

      await expect(getUserProjects("user-123")).resolves.toEqual(projects);
    });
  });
});
