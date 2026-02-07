import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  requireProjectAccess,
  requireProjectAdmin,
  requireTicketProjectAccess,
  AuthenticatedRequest,
  userHasProjectAccess,
  getUserProjects,
} from "../../../../api/middleware/projectAuthorization";
import { db } from "../../../../config/database";

// Mock database
vi.mock("../../../../config/database", () => ({
  db: {
    selectFrom: vi.fn(),
  },
}));

describe("Project Authorization Middleware", () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockStatus: ReturnType<typeof vi.fn>;
  let mockJson: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRequest = {
      user: {
        id: "user-123",
        email: "test@example.com",
        tenant_id: "tenant-1",
        role: "member",
      },
      params: {},
      body: {},
      query: {},
    };

    mockJson = vi.fn();
    mockStatus = vi.fn(() => ({ json: mockJson }));
    mockResponse = {
      status: mockStatus as any,
      headersSent: false,
    };

    mockNext = vi.fn();

    vi.clearAllMocks();
  });

  describe("requireProjectAccess", () => {
    it("should allow access when user has project membership", async () => {
      mockRequest.params = { projectId: "project-123" };

      const mockExecuteTakeFirst = vi.fn().resolves({
        project_id: "project-123",
        role: "member",
      });

      const mockWhere = vi.fn(() => ({
        where: mockWhere,
        executeTakeFirst: mockExecuteTakeFirst,
      }));

      const mockSelect = vi.fn(() => ({
        where: mockWhere,
      }));

      (db.selectFrom as any).mockReturnValue({
        select: mockSelect,
      });

      await requireProjectAccess(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.projectAccess).toEqual({
        projectId: "project-123",
        role: "member",
      });
    });

    it("should deny access when user lacks authentication", async () => {
      mockRequest.user = undefined;

      await requireProjectAccess(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: "Unauthorized",
        message: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should deny access when project ID is missing", async () => {
      await requireProjectAccess(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: "Bad Request",
        message: "Project ID is required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should deny access when user is not member of project", async () => {
      mockRequest.params = { projectId: "project-456" };

      const mockExecuteTakeFirst = vi.fn().resolves(undefined);

      const mockWhere = vi.fn(() => ({
        where: mockWhere,
        executeTakeFirst: mockExecuteTakeFirst,
      }));

      const mockSelect = vi.fn(() => ({
        where: mockWhere,
      }));

      (db.selectFrom as any).mockReturnValue({
        select: mockSelect,
      });

      await requireProjectAccess(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith({
        error: "Forbidden",
        message: "You do not have access to this project",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should extract project ID from body", async () => {
      mockRequest.body = { project_id: "project-789" };

      const mockExecuteTakeFirst = vi.fn().resolves({
        project_id: "project-789",
        role: "admin",
      });

      const mockWhere = vi.fn(() => ({
        where: mockWhere,
        executeTakeFirst: mockExecuteTakeFirst,
      }));

      const mockSelect = vi.fn(() => ({
        where: mockWhere,
      }));

      (db.selectFrom as any).mockReturnValue({
        select: mockSelect,
      });

      await requireProjectAccess(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.projectAccess?.projectId).toBe("project-789");
    });
  });

  describe("requireProjectAdmin", () => {
    it("should allow access when user has admin role", async () => {
      mockRequest.params = { projectId: "project-123" };
      mockRequest.projectAccess = {
        projectId: "project-123",
        role: "admin",
      };

      const mockExecuteTakeFirst = vi.fn().resolves({
        project_id: "project-123",
        role: "admin",
      });

      const mockWhere = vi.fn(() => ({
        where: mockWhere,
        executeTakeFirst: mockExecuteTakeFirst,
      }));

      const mockSelect = vi.fn(() => ({
        where: mockWhere,
      }));

      (db.selectFrom as any).mockReturnValue({
        select: mockSelect,
      });

      await requireProjectAdmin(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it("should deny access when user is not admin", async () => {
      mockRequest.params = { projectId: "project-123" };
      mockRequest.projectAccess = {
        projectId: "project-123",
        role: "member",
      };

      const mockExecuteTakeFirst = vi.fn().resolves({
        project_id: "project-123",
        role: "member",
      });

      const mockWhere = vi.fn(() => ({
        where: mockWhere,
        executeTakeFirst: mockExecuteTakeFirst,
      }));

      const mockSelect = vi.fn(() => ({
        where: mockWhere,
      }));

      (db.selectFrom as any).mockReturnValue({
        select: mockSelect,
      });

      // First call for project access check will succeed but set projectAccess
      await requireProjectAdmin(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      // Should have blocked due to non-admin role
      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith({
        error: "Forbidden",
        message: "Admin access required for this operation",
      });
    });
  });

  describe("requireTicketProjectAccess", () => {
    it("should allow access when user has access to ticket's project", async () => {
      mockRequest.params = { ticketId: "ticket-123" };

      // Mock ticket lookup
      const mockTicketExecuteTakeFirst = vi.fn().resolves({
        project_id: "project-456",
      });

      // Mock user_projects lookup
      const mockUserProjectExecuteTakeFirst = vi.fn().resolves({
        project_id: "project-456",
        role: "member",
      });

      const mockWhere = vi.fn(() => ({
        where: mockWhere,
        executeTakeFirst: mockTicketExecuteTakeFirst,
      }));

      const mockSelect = vi.fn(() => ({
        where: mockWhere,
      }));

      // First call: ticket lookup
      (db.selectFrom as any).mockReturnValueOnce({
        select: mockSelect,
      });

      // Second call: user_projects lookup
      const mockUserProjectWhere = vi.fn(() => ({
        where: mockUserProjectWhere,
        executeTakeFirst: mockUserProjectExecuteTakeFirst,
      }));

      const mockUserProjectSelect = vi.fn(() => ({
        where: mockUserProjectWhere,
      }));

      (db.selectFrom as any).mockReturnValueOnce({
        select: mockUserProjectSelect,
      });

      await requireTicketProjectAccess(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.projectAccess).toEqual({
        projectId: "project-456",
        role: "member",
      });
    });

    it("should return 404 when ticket does not exist", async () => {
      mockRequest.params = { ticketId: "nonexistent" };

      const mockExecuteTakeFirst = vi.fn().resolves(undefined);

      const mockWhere = vi.fn(() => ({
        executeTakeFirst: mockExecuteTakeFirst,
      }));

      const mockSelect = vi.fn(() => ({
        where: mockWhere,
      }));

      (db.selectFrom as any).mockReturnValue({
        select: mockSelect,
      });

      await requireTicketProjectAccess(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext,
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: "Not Found",
        message: "Ticket not found",
      });
    });
  });

  describe("Helper functions", () => {
    describe("userHasProjectAccess", () => {
      it("should return true when user has access", async () => {
        const mockExecuteTakeFirst = vi.fn().resolves({ id: "up-123" });

        const mockWhere = vi.fn(() => ({
          where: mockWhere,
          executeTakeFirst: mockExecuteTakeFirst,
        }));

        const mockSelect = vi.fn(() => ({
          where: mockWhere,
        }));

        (db.selectFrom as any).mockReturnValue({
          select: mockSelect,
        });

        const result = await userHasProjectAccess("user-123", "project-456");

        expect(result).toBe(true);
      });

      it("should return false when user lacks access", async () => {
        const mockExecuteTakeFirst = vi.fn().resolves(undefined);

        const mockWhere = vi.fn(() => ({
          where: mockWhere,
          executeTakeFirst: mockExecuteTakeFirst,
        }));

        const mockSelect = vi.fn(() => ({
          where: mockWhere,
        }));

        (db.selectFrom as any).mockReturnValue({
          select: mockSelect,
        });

        const result = await userHasProjectAccess("user-123", "project-789");

        expect(result).toBe(false);
      });
    });

    describe("getUserProjects", () => {
      it("should return list of user projects", async () => {
        const mockProjects = [
          { project_id: "project-1", role: "admin" },
          { project_id: "project-2", role: "member" },
        ];

        const mockExecute = vi.fn().resolves(mockProjects);

        const mockWhere = vi.fn(() => ({
          execute: mockExecute,
        }));

        const mockSelect = vi.fn(() => ({
          where: mockWhere,
        }));

        (db.selectFrom as any).mockReturnValue({
          select: mockSelect,
        });

        const result = await getUserProjects("user-123");

        expect(result).toEqual(mockProjects);
      });
    });
  });
});
