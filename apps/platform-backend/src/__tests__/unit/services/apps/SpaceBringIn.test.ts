import { RepositoryAccessError } from "@viberglass/integration-core";
import type { AppHomeStatus, Project, ProjectScmConfig } from "@viberglass/types";
import type { EjectedApp } from "../../../../persistence/apps/SpaceBackingDAO";
import { SpaceBringIn, type BringInRequest } from "../../../../services/apps/SpaceBringIn";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const REPOSITORY = { fullName: "acme/laptops", url: "https://github.com/acme/laptops" };
const AVAILABLE: AppHomeStatus = { home: { integrationId: "i-1", credentialId: null, owner: "acme" }, availability: { available: true, missing: [] } };

function project(overrides: Partial<Project> = {}): Project {
  return {
    backingKind: "git",
    id: "space-1",
    name: "Laptops",
    slug: "laptops",
    ticketSystem: "custom",
    credentials: { type: "token" },
    autoFixEnabled: false,
    autoFixTags: [],
    customFieldMappings: {},
    isPrivate: false,
    keyPrefix: "LAP",
    defaultReviewerIds: [],
    questionReminderHours: 4,
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function scmConfig(overrides: Partial<ProjectScmConfig> = {}): ProjectScmConfig {
  return {
    projectId: "space-1",
    integrationId: "i-1",
    sourceRepository: "acme/laptops",
    baseBranch: "main",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function build(options: { project?: Project | null; hasManifest?: boolean } = {}) {
  const host = {
    parseRepository: jest.fn(() => REPOSITORY),
    checkAccess: jest.fn(async () => ({ ...REPOSITORY, defaultBranch: "main", isPrivate: true })),
    hasFile: jest.fn(async () => options.hasManifest ?? false),
  };
  const deps = {
    projects: {
      getProject: jest.fn(async () => (options.project === undefined ? project() : options.project)),
      findByName: jest.fn(async (): Promise<Project | null> => null),
      updateProject: jest.fn(async () => project()),
    },
    appHome: { status: jest.fn(async (): Promise<AppHomeStatus> => AVAILABLE) },
    scmConfigs: { getByProjectId: jest.fn(async (): Promise<ProjectScmConfig | null> => scmConfig()) },
    repositories: { resolve: jest.fn(async (): Promise<{ host: typeof host; token: string } | { unavailable: string }> => ({ host, token: "tok" })) },
    backing: {
      ejected: jest.fn(async (): Promise<EjectedApp | null> => ({ ejectedAt: new Date(), backupId: "b-1", copyBytes: 4096 })),
      makeApp: jest.fn(async () => undefined),
    },
    seeder: { check: jest.fn(), seed: jest.fn(async () => undefined) },
    contractTask: { open: jest.fn(async (): Promise<{ taskId: string; warning: string | null }> => ({ taskId: "task-1", warning: null })) },
  };
  return { bringIn: new SpaceBringIn(deps), deps, host };
}

const NONE: BringInRequest = { startFrom: "none" };

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => null, (error: unknown) => error);
}

describe("SpaceBringIn", () => {
  it("switches the space and asks the agent to follow the contract when there's no manifest", async () => {
    const { bringIn, deps, host } = build();

    await expect(bringIn.bringIn("space-1", "u-1", NONE)).resolves.toEqual({ slug: "laptops", contractTaskId: "task-1", warnings: [] });

    expect(host.checkAccess).toHaveBeenCalledWith(REPOSITORY, "tok");
    expect(host.hasFile).toHaveBeenCalledWith(REPOSITORY, "viberglass.app.json", "main", "tok");
    expect(deps.seeder.seed).toHaveBeenCalledWith("space-1", { from: "none" });
    expect(deps.backing.makeApp).toHaveBeenCalledWith("space-1");
    expect(deps.seeder.seed.mock.invocationCallOrder[0]).toBeLessThan(deps.backing.makeApp.mock.invocationCallOrder[0]);
    expect(deps.contractTask.open).toHaveBeenCalledWith("space-1", "u-1");
  });

  it("creates no task when the repository already has a manifest", async () => {
    const { bringIn, deps } = build({ hasManifest: true });

    await expect(bringIn.bringIn("space-1", "u-1", NONE)).resolves.toEqual({ slug: "laptops", contractTaskId: null, warnings: [] });
    expect(deps.contractTask.open).not.toHaveBeenCalled();
  });

  it("passes on why the agent couldn't start on the task", async () => {
    const { bringIn, deps } = build();
    deps.contractTask.open.mockResolvedValue({ taskId: "task-1", warning: "No default agent." });

    await expect(bringIn.bringIn("space-1", "u-1", NONE)).resolves.toEqual({ slug: "laptops", contractTaskId: "task-1", warnings: ["No default agent."] });
  });

  it("starts from the copy kept when the app was ejected", async () => {
    const { bringIn, deps } = build();

    await bringIn.bringIn("space-1", "u-1", { startFrom: "last_copy" });
    expect(deps.seeder.seed).toHaveBeenCalledWith("space-1", { from: "last_copy", backupId: "b-1" });
  });

  it("refuses the last copy when there isn't one", async () => {
    const { bringIn, deps } = build();
    deps.backing.ejected.mockResolvedValue({ ejectedAt: new Date(), backupId: null, copyBytes: null });

    expect(await failure(bringIn.bringIn("space-1", "u-1", { startFrom: "last_copy" }))).toMatchObject({ code: "NO_LAST_COPY" });
    expect(deps.backing.makeApp).not.toHaveBeenCalled();
  });

  it("checks an uploaded file before changing anything", async () => {
    const { bringIn, deps } = build();
    deps.seeder.check.mockImplementation(() => {
      throw Object.assign(new Error("That file isn't a SQLite database."), { code: "DATA_FILE_INVALID" });
    });

    expect(await failure(bringIn.bringIn("space-1", "u-1", { startFrom: "upload", uploadPath: "/tmp/upload" }))).toMatchObject({ code: "DATA_FILE_INVALID" });
    expect(deps.seeder.check).toHaveBeenCalledWith({ from: "upload", path: "/tmp/upload" });
    expect(deps.seeder.seed).not.toHaveBeenCalled();
    expect(deps.backing.makeApp).not.toHaveBeenCalled();
  });

  it("asks for a new name when the space's doesn't work as an app's address, and renames it", async () => {
    const { bringIn, deps } = build({ project: project({ name: "Preview tools", slug: "preview-tools" }) });

    expect(await failure(bringIn.bringIn("space-1", "u-1", NONE))).toMatchObject({ code: "SPACE_NAME_INVALID" });

    await expect(bringIn.bringIn("space-1", "u-1", { ...NONE, name: "Tools" })).resolves.toMatchObject({ slug: "tools" });
    expect(deps.projects.updateProject).toHaveBeenCalledWith("space-1", { name: "Tools" });
  });

  it("refuses a new name another space has", async () => {
    const { bringIn, deps } = build();
    deps.projects.findByName.mockResolvedValue(project({ id: "space-2", name: "Tools" }));

    expect(await failure(bringIn.bringIn("space-1", "u-1", { ...NONE, name: "Tools" }))).toMatchObject({ code: "SPACE_EXISTS" });
  });

  it("refuses when the token can't merge, saying how to fix the connection", async () => {
    const { bringIn, deps, host } = build();
    host.checkAccess.mockRejectedValue(new RepositoryAccessError("REPOSITORY_READ_ONLY", "This token can read acme/laptops but can't push to it."));

    const error = await failure(bringIn.bringIn("space-1", "u-1", NONE));
    expect(error).toMatchObject({ code: "CANT_MERGE", message: expect.stringContaining("under Connections") });
    expect(deps.seeder.seed).not.toHaveBeenCalled();
  });

  it("refuses a space whose pull requests go to another repository", async () => {
    const { bringIn, deps } = build();
    deps.scmConfigs.getByProjectId.mockResolvedValue(scmConfig({ pullRequestRepository: "acme/laptops-upstream" }));

    expect(await failure(bringIn.bringIn("space-1", "u-1", NONE))).toMatchObject({ code: "REPOSITORY_UNAVAILABLE" });
  });

  it("refuses when the code host can't be used", async () => {
    const { bringIn, deps } = build();
    deps.repositories.resolve.mockResolvedValue({ unavailable: "The space's repository connection has no token" });

    expect(await failure(bringIn.bringIn("space-1", "u-1", NONE))).toMatchObject({ code: "REPOSITORY_UNAVAILABLE" });
  });

  it("only brings in git spaces that aren't archived, where apps can be hosted", async () => {
    expect(await failure(build({ project: project({ backingKind: "files" }) }).bringIn.bringIn("space-1", "u-1", NONE))).toMatchObject({ code: "NOT_A_GIT_SPACE" });
    expect(await failure(build({ project: project({ archivedAt: "2026-11-01T00:00:00Z" }) }).bringIn.bringIn("space-1", "u-1", NONE))).toMatchObject({ code: "ARCHIVED" });
    const unavailable = build();
    unavailable.deps.appHome.status.mockResolvedValue({ home: null, availability: { available: false, missing: ["app_home"] } });
    expect(await failure(unavailable.bringIn.bringIn("space-1", "u-1", NONE))).toMatchObject({ code: "APP_SPACES_UNAVAILABLE" });
    await expect(build({ project: null }).bringIn.bringIn("space-1", "u-1", NONE)).resolves.toBeNull();
  });
});
