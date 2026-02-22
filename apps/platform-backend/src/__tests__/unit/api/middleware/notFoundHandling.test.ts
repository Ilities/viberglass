import express from "express";
import type { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import logger from "../../../../config/logger";
import {
  applicationErrorHandler,
  notFoundHandler,
} from "../../../../api/middleware/notFoundHandling";

type MockRequest = Partial<Request> & {
  path: string;
  originalUrl: string;
  url: string;
  method: string;
  ip: string;
  get: jest.Mock;
  app: Request["app"];
};

type MockResponse = Partial<Response> & {
  locals: Record<string, unknown>;
  status: jest.Mock;
  json: jest.Mock;
};

function createRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  const app = express();
  app.set("env", "test");

  return {
    path: "/",
    originalUrl: "/",
    url: "/",
    method: "GET",
    ip: "127.0.0.1",
    get: jest.fn().mockReturnValue("Mozilla/5.0"),
    app,
    ...overrides,
  };
}

function createResponse(): MockResponse {
  const res: MockResponse = {
    locals: {},
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe("notFoundHandling middleware", () => {
  let req: MockRequest;
  let res: MockResponse;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    req = createRequest();
    res = createResponse();
    next = jest.fn();
    jest.restoreAllMocks();
  });

  describe("notFoundHandler", () => {
    it("logs non-api misses as debug and forwards 404", () => {
      const debugSpy = jest.spyOn(logger, "debug").mockImplementation();
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();

      req.path = "/favicon.ico";
      req.url = "/favicon.ico";
      req.originalUrl = "/favicon.ico";

      notFoundHandler(req as Request, res as Response, next);

      expect(debugSpy).toHaveBeenCalledWith(
        "Route not found (low signal)",
        expect.objectContaining({ path: "/favicon.ico" }),
      );
      expect(warnSpy).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect((next.mock.calls[0]?.[0] as { status?: number }).status).toBe(404);
    });

    it("logs unknown api misses as warn and forwards 404", () => {
      const debugSpy = jest.spyOn(logger, "debug").mockImplementation();
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();

      req.path = "/api/unknown";
      req.url = "/api/unknown";
      req.originalUrl = "/api/unknown";

      notFoundHandler(req as Request, res as Response, next);

      expect(warnSpy).toHaveBeenCalledWith(
        "Route not found",
        expect.objectContaining({ path: "/api/unknown" }),
      );
      expect(debugSpy).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect((next.mock.calls[0]?.[0] as { status?: number }).status).toBe(404);
    });
  });

  describe("applicationErrorHandler", () => {
    it("returns 404 response without logging as application error", () => {
      const errorSpy = jest.spyOn(logger, "error").mockImplementation();
      const err = createError(404, "Not Found");

      applicationErrorHandler(err, req as Request, res as Response, next);

      expect(errorSpy).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Not Found" });
    });

    it("logs and returns 500 for non-404 errors", () => {
      const errorSpy = jest.spyOn(logger, "error").mockImplementation();
      const err = new Error("Boom");

      req.app.set("env", "production");
      applicationErrorHandler(err, req as Request, res as Response, next);

      expect(errorSpy).toHaveBeenCalledWith(
        "Application error",
        expect.objectContaining({
          message: "Boom",
          status: undefined,
          method: "GET",
          path: "/",
        }),
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Boom" });
    });
  });
});
