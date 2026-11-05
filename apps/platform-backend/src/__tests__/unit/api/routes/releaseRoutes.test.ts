import express from "express";
import request from "supertest";
import type { ReleaseCompleteRequest } from "@viberglass/types";
import { registerReleaseRoutes } from "../../../../api/routes/jobs/releaseRoutes";
import { ReleaseCallbackDenied } from "../../../../services/apps/ReleaseCallbackService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));
jest.mock("../../../../api/middleware/callbackTokenValidation", () => ({
  validateCallbackToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../../../api/middleware/tenantValidation", () => ({
  tenantMiddleware: (req: { tenantId?: string }, _res: unknown, next: () => void) => {
    req.tenantId = "api-server";
    next();
  },
}));

const READY = { outcome: "ready", sha256: "a".repeat(64), bundleBytes: 2048, nodeVersion: "v24.11.0", buildLog: "built" };

function setup() {
  const releases = {
    grant: jest.fn(async (_jobId: string, _tenantId: string) => ({ url: "https://storage.example/put", expiresAt: "2026-11-03T12:15:00Z" })),
    complete: jest.fn(async (_jobId: string, _tenantId: string, request: ReleaseCompleteRequest) => (request.outcome === "ready" ? ("ready" as const) : ("failed" as const))),
  };
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerReleaseRoutes(router, releases);
  app.use("/api/jobs", router);
  return { app, releases };
}

describe("release build callbacks", () => {
  it("hands the build an upload URL that isn't cached", async () => {
    const { app, releases } = setup();

    const response = await request(app).post("/api/jobs/build_1/release/storage-url").send({});

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data.url).toBe("https://storage.example/put");
    expect(releases.grant).toHaveBeenCalledWith("build_1", "api-server");
  });

  it("records a ready or failed build", async () => {
    const { app, releases } = setup();

    expect((await request(app).post("/api/jobs/build_1/release/complete").send(READY)).body.data).toEqual({ status: "ready" });
    const failed = { outcome: "failed", reason: "The build command exited with code 1", buildLog: "npm ERR!" };
    expect((await request(app).post("/api/jobs/build_1/release/complete").send(failed)).body.data).toEqual({ status: "failed" });
    expect(releases.complete).toHaveBeenLastCalledWith("build_1", "api-server", failed);
  });

  it("records the settings a ready build's manifest declares", async () => {
    const { app, releases } = setup();
    const settings = [{ name: "SLACK_TOKEN", secret: true, description: "Posts to Slack" }];

    await request(app).post("/api/jobs/build_1/release/complete").send({ ...READY, settings }).expect(200);
    expect(releases.complete).toHaveBeenLastCalledWith("build_1", "api-server", { ...READY, settings });
  });

  it.each([
    ["a sha256 that isn't one", { ...READY, sha256: "nope" }],
    ["an empty bundle", { ...READY, bundleBytes: 0 }],
    ["a Node version that isn't one", { ...READY, nodeVersion: "24" }],
    ["no build log", { outcome: "failed", reason: "x" }],
    ["an unknown outcome", { ...READY, outcome: "live" }],
    ["settings that aren't a list", { ...READY, settings: "SLACK_TOKEN" }],
    ["a reserved setting name", { ...READY, settings: [{ name: "AWS_REGION", secret: false }] }],
  ])("refuses %s", async (_case, body) => {
    const { app, releases } = setup();

    expect((await request(app).post("/api/jobs/build_1/release/complete").send(body)).status).toBe(400);
    expect(releases.complete).not.toHaveBeenCalled();
  });

  it("answers 409 to a build that may not do this", async () => {
    const { app, releases } = setup();
    releases.grant.mockRejectedValue(new ReleaseCallbackDenied("Only the release's running build can do this"));

    const response = await request(app).post("/api/jobs/build_1/release/storage-url").send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Only the release's running build can do this");
  });
});
