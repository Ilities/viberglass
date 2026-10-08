import jobsRouter from "../../../../api/routes/jobs";
import { requireAuth } from "../../../../api/middleware/authentication";
import { requireRunnerRole } from "../../../../api/middleware/workspaceRoleGuards";
import { validateCallbackToken } from "../../../../api/middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../../../api/middleware/tenantValidation";

function getRouteHandlers(path: string, method: string): Array<(...args: unknown[]) => unknown> {
  const layer = (jobsRouter as any).stack.find(
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

describe("jobs route auth boundaries", () => {
  it("authenticates worker storage and heartbeats with the run token and tenant", () => {
    for (const path of ["/:jobId/storage-url", "/:jobId/heartbeat"]) {
      expect(getRouteHandlers(path, "post")).toContain(validateCallbackToken);
      expect(getRouteHandlers(path, "post")).toContain(tenantMiddleware);
      expect(getRouteHandlers(path, "post")).not.toContain(requireAuth);
    }
  });
  it("requires user auth on job management endpoints", () => {
    expect(getRouteHandlers("/", "get")).toContain(requireAuth);
    expect(getRouteHandlers("/:jobId", "get")).toContain(requireAuth);
    expect(getRouteHandlers("/stats/queue", "get")).toContain(requireAuth);
  });

  it("lets only admins and members start, delete or cancel runs", () => {
    expect(getRouteHandlers("/", "post")).toContain(requireRunnerRole);
    expect(getRouteHandlers("/:jobId", "delete")).toContain(requireRunnerRole);
    expect(getRouteHandlers("/:jobId/cancel", "post")).toContain(requireRunnerRole);
  });

  it("does not require user auth on worker callback endpoints", () => {
    expect(getRouteHandlers("/:jobId/result", "post")).not.toContain(
      requireAuth,
    );
    expect(getRouteHandlers("/:jobId/progress", "post")).not.toContain(
      requireAuth,
    );
    expect(getRouteHandlers("/:jobId/logs", "post")).not.toContain(
      requireAuth,
    );
    expect(getRouteHandlers("/:jobId/logs/batch", "post")).not.toContain(
      requireAuth,
    );
  });
});
