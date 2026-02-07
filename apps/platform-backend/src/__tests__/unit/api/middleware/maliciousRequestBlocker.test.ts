import { Request, Response, NextFunction } from "express";
import { maliciousRequestBlocker, suspiciousIpTracker, BLOCKED_PATHS, BLOCKED_PATTERNS } from "../../../api/middleware/maliciousRequestBlocker";

describe("maliciousRequestBlocker", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      path: "/",
      originalUrl: "/",
      method: "GET",
      ip: "192.168.1.1",
      get: jest.fn().mockReturnValue("Mozilla/5.0"),
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe("maliciousRequestBlocker", () => {
    it("should call next for normal requests", () => {
      req.path = "/api/projects";

      maliciousRequestBlocker(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should allow legitimate API auth endpoints", () => {
      req.path = "/api/auth/login";
      req.originalUrl = "/api/auth/login";

      maliciousRequestBlocker(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should allow other API auth endpoints", () => {
      const paths = ["/api/auth/register", "/api/auth/logout", "/api/auth/me"];

      paths.forEach(path => {
        req.path = path;
        req.originalUrl = path;
        next.mockClear();
        (res.status as jest.Mock).mockClear();

        maliciousRequestBlocker(req as Request, res as Response, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    });

    it("should block requests for /.env", () => {
      req.path = "/.env";
      req.originalUrl = "/.env";
      
      maliciousRequestBlocker(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("should block requests for /.git/HEAD", () => {
      req.path = "/.git/HEAD";
      req.originalUrl = "/.git/HEAD";
      
      maliciousRequestBlocker(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("should block requests for /wp-admin", () => {
      req.path = "/wp-admin";
      req.originalUrl = "/wp-admin";
      
      maliciousRequestBlocker(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("should block requests matching backup file patterns", () => {
      req.path = "/config.json.backup";
      req.originalUrl = "/config.json.backup";
      
      maliciousRequestBlocker(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("should block requests for .sql files", () => {
      req.path = "/dump.sql";
      req.originalUrl = "/dump.sql";
      
      maliciousRequestBlocker(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("should block case-insensitive matches", () => {
      req.path = "/.ENV";
      req.originalUrl = "/.ENV";
      
      maliciousRequestBlocker(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("suspiciousIpTracker", () => {
    it("should call next for normal requests", () => {
      req.path = "/api/projects";
      
      suspiciousIpTracker(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
    });

    it("should track suspicious requests from same IP", () => {
      req.path = "/.env";
      req.originalUrl = "/.env";
      
      // Make 4 suspicious requests (below threshold)
      for (let i = 0; i < 4; i++) {
        suspiciousIpTracker(req as Request, res as Response, next);
      }
      
      // Should still be able to access after 4 requests
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it("should block IP after threshold exceeded", () => {
      req.path = "/.env";
      req.originalUrl = "/.env";
      
      // Make 5 suspicious requests (at threshold)
      for (let i = 0; i < 5; i++) {
        suspiciousIpTracker(req as Request, res as Response, next);
      }
      
      // 6th request should be blocked
      suspiciousIpTracker(req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    });
  });

  describe("BLOCKED_PATHS", () => {
    it("should contain common probe paths", () => {
      expect(BLOCKED_PATHS.has("/.env")).toBe(true);
      expect(BLOCKED_PATHS.has("/.git/HEAD")).toBe(true);
      expect(BLOCKED_PATHS.has("/wp-admin")).toBe(true);
      expect(BLOCKED_PATHS.has("/phpmyadmin")).toBe(true);
    });
  });

  describe("BLOCKED_PATTERNS", () => {
    it("should include path traversal pattern", () => {
      const traversalPattern = BLOCKED_PATTERNS[0];
      expect(traversalPattern.test("/../../../etc/passwd")).toBe(true);
    });

    it("should include hidden file pattern", () => {
      const hiddenPattern = BLOCKED_PATTERNS[1];
      expect(hiddenPattern.test("/.env")).toBe(true);
      expect(hiddenPattern.test("/.git/config")).toBe(true);
    });
  });
});
