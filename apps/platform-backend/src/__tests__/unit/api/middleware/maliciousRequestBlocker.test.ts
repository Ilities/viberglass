import { Request, Response } from "express";
import {
  maliciousRequestBlocker,
  suspiciousIpTracker,
  BLOCKED_PATHS,
  BLOCKED_PATTERNS,
  suspiciousIps,
} from "../../../../api/middleware/maliciousRequestBlocker";

type MockRequest = Partial<Request> & {
  path: string;
  originalUrl: string;
  method: string;
  ip: string;
  get: jest.Mock;
};

type MockResponse = Partial<Response> & {
  status: jest.Mock;
  json: jest.Mock;
  end: jest.Mock;
};

function createRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    path: "/",
    originalUrl: "/",
    method: "GET",
    ip: "192.168.1.1",
    get: jest.fn().mockReturnValue("Mozilla/5.0"),
    ...overrides,
  };
}

function createResponse(): MockResponse {
  const res: MockResponse = {
    status: jest.fn(),
    json: jest.fn(),
    end: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.end.mockReturnValue(res);
  return res;
}

describe("maliciousRequestBlocker middleware", () => {
  let req: MockRequest;
  let res: MockResponse;
  let next: jest.Mock;

  beforeEach(() => {
    req = createRequest();
    res = createResponse();
    next = jest.fn();
    suspiciousIps.clear();
    jest.clearAllMocks();
  });

  describe("maliciousRequestBlocker", () => {
    it("calls next for normal requests", () => {
      req.path = "/api/projects";
      req.originalUrl = "/api/projects";

      maliciousRequestBlocker(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("allows legitimate auth endpoints", () => {
      const paths = [
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/logout",
        "/api/auth/me",
      ];

      for (const path of paths) {
        req.path = path;
        req.originalUrl = path;
        next.mockClear();
        res.status.mockClear();

        maliciousRequestBlocker(req as Request, res as Response, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it("blocks probe and backup paths", () => {
      const blockedPaths = ["/.env", "/.git/HEAD", "/wp-admin", "/dump.sql"];

      for (const path of blockedPaths) {
        req.path = path;
        req.originalUrl = path;
        next.mockClear();
        res.status.mockClear();
        res.end.mockClear();

        maliciousRequestBlocker(req as Request, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.end).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
      }
    });

    it("blocks case-insensitive hidden file probes", () => {
      req.path = "/.ENV";
      req.originalUrl = "/.ENV";

      maliciousRequestBlocker(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("suspiciousIpTracker", () => {
    it("calls next for normal requests", () => {
      req.path = "/api/projects";
      req.originalUrl = "/api/projects";

      suspiciousIpTracker(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("blocks IP after suspicious threshold is exceeded", () => {
      req.path = "/.env";
      req.originalUrl = "/.env";

      for (let i = 0; i < 5; i++) {
        suspiciousIpTracker(req as Request, res as Response, next);
      }

      suspiciousIpTracker(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    });
  });

  describe("exports", () => {
    it("BLOCKED_PATHS contains common probe targets", () => {
      expect(BLOCKED_PATHS.has("/.env")).toBe(true);
      expect(BLOCKED_PATHS.has("/.git/HEAD")).toBe(true);
      expect(BLOCKED_PATHS.has("/wp-admin")).toBe(true);
      expect(BLOCKED_PATHS.has("/phpmyadmin")).toBe(true);
    });

    it("BLOCKED_PATTERNS catch traversal and hidden files", () => {
      expect(BLOCKED_PATTERNS[0].test("/../../../etc/passwd")).toBe(true);
      expect(BLOCKED_PATTERNS[1].test("/.env")).toBe(true);
      expect(BLOCKED_PATTERNS[1].test("/.git/config")).toBe(true);
    });
  });
});
