import { SpaceDeletionService } from "../../../../services/spaces/SpaceDeletionService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

function build(backingKind: "git" | "files" | "app" | null, bucket = "uploads") {
  const deps = {
    projects: {
      getProject: jest.fn(async () => (backingKind ? { id: "space-1", name: "Laptops", backingKind } : null)),
      deleteProject: jest.fn(async () => undefined),
    },
    apps: { tearDown: jest.fn(async (_projectId: string, _name: string) => ["The repository acme/laptops wasn't archived."]) },
    storage: { delete: jest.fn(async () => undefined) },
  };
  const service = new SpaceDeletionService(deps.projects, deps.apps, deps.storage, () => bucket);
  return { service, deps };
}

describe("SpaceDeletionService", () => {
  it("tears down an App space and erases its objects before deleting its rows", async () => {
    const { service, deps } = build("app");

    await expect(service.delete("space-1")).resolves.toEqual({ warnings: ["The repository acme/laptops wasn't archived."] });
    expect(deps.apps.tearDown).toHaveBeenCalledWith("space-1", "Laptops");
    expect(deps.storage.delete).toHaveBeenCalledWith("s3://uploads/spaces/space-1/");
    expect(deps.apps.tearDown.mock.invocationCallOrder[0]).toBeLessThan(deps.storage.delete.mock.invocationCallOrder[0]);
    expect(deps.storage.delete.mock.invocationCallOrder[0]).toBeLessThan(deps.projects.deleteProject.mock.invocationCallOrder[0]);
  });

  it("erases a Files space's objects without touching apps", async () => {
    const { service, deps } = build("files");

    await expect(service.delete("space-1")).resolves.toEqual({ warnings: [] });
    expect(deps.apps.tearDown).not.toHaveBeenCalled();
    expect(deps.storage.delete).toHaveBeenCalledWith("s3://uploads/spaces/space-1/");
  });

  it("keeps the space when its objects couldn't be erased, so it can be deleted again", async () => {
    const { service, deps } = build("git");
    deps.storage.delete.mockRejectedValueOnce(new Error("storage down"));

    await expect(service.delete("space-1")).rejects.toThrow("storage down");
    expect(deps.projects.deleteProject).not.toHaveBeenCalled();
  });

  it("skips storage when none is configured, and answers null for an unknown space", async () => {
    const noStorage = build("git", "");
    await noStorage.service.delete("space-1");
    expect(noStorage.deps.storage.delete).not.toHaveBeenCalled();
    expect(noStorage.deps.projects.deleteProject).toHaveBeenCalledWith("space-1");

    await expect(build(null).service.delete("space-1")).resolves.toBeNull();
  });
});
