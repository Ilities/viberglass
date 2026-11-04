import type { AppHomeStatus, Project } from "@viberglass/types";
import { AppSpaceCreator } from "../../../../services/apps/AppSpaceCreator";
import { AppSpaceError } from "../../../../services/apps/AppSpaceError";
import { RepositoryCreationError } from "../../../../services/repositories/RepositoryCreationError";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const HOME = { integrationId: "integration-1", credentialId: null, owner: "acme" };
const READY: AppHomeStatus = { home: HOME, availability: { available: true, missing: [] } };
const REPOSITORY = { fullName: "acme/laptops", url: "https://github.com/acme/laptops", defaultBranch: "main", isPrivate: true };

function project(overrides: Partial<Project> = {}): Project {
  return {
    backingKind: "app",
    id: "project-1",
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
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function build(options: { status?: AppHomeStatus; existing?: Project | null } = {}) {
  const deps = {
    appHome: { status: jest.fn(async () => options.status ?? READY) },
    projects: {
      findByName: jest.fn(async (_slug: string) => options.existing ?? null),
      createProject: jest.fn(async () => project()),
      deleteProject: jest.fn(async () => undefined),
    },
    links: { linkIntegration: jest.fn(async () => ({ id: "link-1", projectId: "project-1", integrationId: "integration-1", isPrimary: true, createdAt: "" })) },
    scmConfigs: { upsertByProjectId: jest.fn(async () => ({ projectId: "project-1", integrationId: "integration-1", sourceRepository: REPOSITORY.url, baseBranch: "main", createdAt: "", updatedAt: "" })) },
    creator: { create: jest.fn(async () => REPOSITORY) },
  };
  return { creator: new AppSpaceCreator(deps), deps };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => { throw new Error("Expected a failure"); }, (error: unknown) => error);
}

describe("AppSpaceCreator", () => {
  it("creates the space, its repository in the App home named after the space, and its repository settings", async () => {
    const { creator, deps } = build();
    const created = await creator.create(" Laptops ", "user-1");

    expect(deps.projects.createProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Laptops", backingKind: "app", primaryScmIntegrationId: "integration-1" }), "user-1");
    expect(deps.creator.create).toHaveBeenCalledWith("integration-1", null, { owner: "acme", name: "laptops" });
    expect(deps.links.linkIntegration).toHaveBeenCalledWith({ projectId: "project-1", integrationId: "integration-1", isPrimary: true });
    expect(deps.scmConfigs.upsertByProjectId).toHaveBeenCalledWith("project-1", {
      integrationId: "integration-1",
      sourceRepository: REPOSITORY.url,
      baseBranch: "main",
      integrationCredentialId: null,
    });
    expect(created).toEqual({ project: project(), repository: REPOSITORY });
  });

  it("removes the space again when its repository can't be created", async () => {
    const { creator, deps } = build();
    deps.creator.create.mockRejectedValue(new RepositoryCreationError("REPOSITORY_EXISTS", "acme/laptops already exists."));

    expect(await failure(creator.create("Laptops"))).toBeInstanceOf(RepositoryCreationError);
    expect(deps.projects.deleteProject).toHaveBeenCalledWith("project-1");
    expect(deps.scmConfigs.upsertByProjectId).not.toHaveBeenCalled();
  });

  it("sends a problem with the App home's token to an administrator", async () => {
    const { creator, deps } = build();
    deps.creator.create.mockRejectedValue(new RepositoryCreationError("TOKEN_REJECTED", "GitHub rejected this token."));

    expect(await failure(creator.create("Laptops"))).toMatchObject({
      code: "APP_HOME_BROKEN",
      message: "Couldn't create the app's repository: GitHub rejected this token. Ask an administrator to check the App home in Settings, under Apps.",
    });
    expect(deps.projects.deleteProject).toHaveBeenCalledWith("project-1");
  });

  it("removes the space again when saving its repository settings fails", async () => {
    const { creator, deps } = build();
    deps.scmConfigs.upsertByProjectId.mockRejectedValue(new Error("database down"));

    await expect(creator.create("Laptops")).rejects.toThrow("database down");
    expect(deps.projects.deleteProject).toHaveBeenCalledWith("project-1");
  });

  it("refuses when the workspace isn't set up for App spaces", async () => {
    const { creator, deps } = build({ status: { home: HOME, availability: { available: false, missing: ["apps_domain"] } } });

    const error = await failure(creator.create("Laptops"));
    expect(error).toBeInstanceOf(AppSpaceError);
    expect(error).toMatchObject({ code: "APP_SPACES_UNAVAILABLE", statusCode: 409 });
    expect(deps.projects.createProject).not.toHaveBeenCalled();
  });

  it("refuses a name that's taken, before creating anything", async () => {
    const { creator, deps } = build({ existing: project({ archivedAt: "2026-11-01T00:00:00.000Z" }) });

    const error = await failure(creator.create("Laptops"));
    expect(error).toMatchObject({ code: "SPACE_EXISTS", message: expect.stringContaining("(archived)") });
    expect(deps.projects.createProject).not.toHaveBeenCalled();
  });

  it("refuses a name without letters or numbers", async () => {
    const { creator } = build();
    expect(await failure(creator.create("!!!"))).toMatchObject({ code: "SPACE_NAME_INVALID" });
  });

  it("refuses a name that can't be the app's host name", async () => {
    const { creator } = build();
    expect(await failure(creator.create("laptop_tracker"))).toMatchObject({ code: "SPACE_NAME_INVALID" });
    expect(await failure(creator.create("a".repeat(64)))).toMatchObject({ code: "SPACE_NAME_INVALID" });
  });
});
