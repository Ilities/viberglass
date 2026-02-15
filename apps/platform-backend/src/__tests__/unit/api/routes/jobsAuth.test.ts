import jobsRouter from "../../../../api/routes/jobs";
import { requireAuth } from "../../../../api/middleware/authentication";

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
  it("requires user auth on job management endpoints", () => {
    expect(getRouteHandlers("/", "post")).toContain(requireAuth);
    expect(getRouteHandlers("/", "get")).toContain(requireAuth);
    expect(getRouteHandlers("/:jobId", "get")).toContain(requireAuth);
    expect(getRouteHandlers("/:jobId", "delete")).toContain(requireAuth);
    expect(getRouteHandlers("/stats/queue", "get")).toContain(requireAuth);
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
