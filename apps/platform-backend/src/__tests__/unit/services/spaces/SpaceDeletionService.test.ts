import { SpaceDeletionService } from "../../../../services/spaces/SpaceDeletionService";
import type { SpaceHoldings } from "../../../../persistence/project/SpaceDeletionDAO";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const HOLDINGS: SpaceHoldings = {
  runIds: ["job_done", "job_running"],
  activeRunIds: ["job_running"],
  taskIds: ["task-1"],
  sessionIds: ["session-1"],
  media: [{ id: "media-1", url: "s3://uploads/ticket-media/screenshots/media-1.png" }],
};

function build(backingKind: "git" | "files" | "app" | null) {
  const deps = {
    projects: { getProject: jest.fn(async () => (backingKind ? { id: "space-1", name: "Laptops", backingKind } : null)) },
    apps: { tearDown: jest.fn(async (_projectId: string, _name: string) => ["The repository acme/laptops wasn't archived."]) },
    spaces: { holdings: jest.fn(async () => HOLDINGS), delete: jest.fn(async () => undefined) },
    runs: { stopJob: jest.fn(async () => "cancelled" as const) },
    storage: { purge: jest.fn(async () => undefined) },
  };
  const service = new SpaceDeletionService(deps.projects, deps.apps, deps.spaces, deps.runs, deps.storage);
  return { service, deps };
}

function order(mock: jest.Mock): number {
  return mock.mock.invocationCallOrder[0];
}

describe("SpaceDeletionService", () => {
  it("tears down an App space, stops its runs and erases its objects before deleting its rows", async () => {
    const { service, deps } = build("app");

    await expect(service.delete("space-1")).resolves.toEqual({ warnings: ["The repository acme/laptops wasn't archived."] });
    expect(deps.apps.tearDown).toHaveBeenCalledWith("space-1", "Laptops");
    expect(deps.runs.stopJob).toHaveBeenCalledTimes(1);
    expect(deps.runs.stopJob).toHaveBeenCalledWith("job_running");
    expect(deps.storage.purge).toHaveBeenCalledWith("space-1", HOLDINGS);
    expect(deps.spaces.delete).toHaveBeenCalledWith("space-1", ["media-1"]);
    expect(order(deps.apps.tearDown)).toBeLessThan(order(deps.runs.stopJob));
    expect(order(deps.runs.stopJob)).toBeLessThan(order(deps.storage.purge));
    expect(order(deps.storage.purge)).toBeLessThan(order(deps.spaces.delete));
  });

  it("deletes a Files space with its runs without touching apps", async () => {
    const { service, deps } = build("files");

    await expect(service.delete("space-1")).resolves.toEqual({ warnings: [] });
    expect(deps.apps.tearDown).not.toHaveBeenCalled();
    expect(deps.spaces.delete).toHaveBeenCalledWith("space-1", ["media-1"]);
  });

  it("keeps the space when its objects couldn't be erased, so it can be deleted again", async () => {
    const { service, deps } = build("git");
    deps.storage.purge.mockRejectedValueOnce(new Error("storage down"));

    await expect(service.delete("space-1")).rejects.toThrow("storage down");
    expect(deps.spaces.delete).not.toHaveBeenCalled();
  });

  it("keeps the space when a run couldn't be stopped", async () => {
    const { service, deps } = build("git");
    deps.runs.stopJob.mockRejectedValueOnce(new Error("cluster unreachable"));

    await expect(service.delete("space-1")).rejects.toThrow("cluster unreachable");
    expect(deps.storage.purge).not.toHaveBeenCalled();
    expect(deps.spaces.delete).not.toHaveBeenCalled();
  });

  it("answers null for an unknown space", async () => {
    const { service, deps } = build(null);

    await expect(service.delete("space-1")).resolves.toBeNull();
    expect(deps.spaces.holdings).not.toHaveBeenCalled();
  });
});
