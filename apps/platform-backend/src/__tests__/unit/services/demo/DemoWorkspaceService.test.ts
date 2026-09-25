import type { ProjectConfig } from "../../../../models/PMIntegration";
import type { DemoSeedRecord } from "../../../../persistence/demo/DemoSeedRecordDAO";
import { DemoWorkspaceService } from "../../../../services/demo/DemoWorkspaceService";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));
jest.mock("../../../../services/demo/DemoWorkspaceSeeder", () => ({ DemoWorkspaceSeeder: jest.fn() }));

const DEMO_PROJECT: ProjectConfig = {
  id: "demo-project",
  name: "Demo: Acme storefront",
  slug: "demo-acme-storefront",
  ticketSystem: "custom",
  credentials: { type: "token" },
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  createdAt: "",
  updatedAt: "",
};

function build(options: { records?: DemoSeedRecord[]; nameTaken?: boolean; seedFails?: boolean } = {}) {
  const calls: string[] = [];
  let records = options.records ?? [];
  const deps = {
    records: {
      list: jest.fn(async () => records),
      clear: jest.fn(async () => {
        calls.push("clear");
        records = [];
      }),
    },
    projects: {
      getProject: jest.fn(async (id: string) => (id === DEMO_PROJECT.id ? DEMO_PROJECT : null)),
      findByName: jest.fn(async () => (options.nameTaken ? DEMO_PROJECT : null)),
      deleteProject: jest.fn(async (id: string) => void calls.push(`project:${id}`)),
    },
    jobs: { deleteJobs: jest.fn(async (ids: string[]) => void calls.push(`jobs:${ids.join(",")}`)) },
    clankers: { deleteClanker: jest.fn(async (id: string) => void calls.push(`clanker:${id}`)) },
    users: { deleteUser: jest.fn(async (id: string) => void calls.push(`user:${id}`)) },
    seeder: {
      seed: jest.fn(async () => {
        records = [{ entityType: "user", entityId: "u1" }];
        if (options.seedFails) throw new Error("insert failed");
        return DEMO_PROJECT;
      }),
    },
  };
  return { service: new DemoWorkspaceService(deps), deps, calls };
}

const LOADED: DemoSeedRecord[] = [
  { entityType: "user", entityId: "u1" },
  { entityType: "clanker", entityId: "c1" },
  { entityType: "project", entityId: "demo-project" },
  { entityType: "job", entityId: "j1" },
  { entityType: "job", entityId: "j2" },
];

describe("DemoWorkspaceService", () => {
  it("loads the demo and reports it", async () => {
    const { service } = build();

    await expect(service.load()).resolves.toEqual({
      projectId: "demo-project",
      name: "Demo: Acme storefront",
      slug: "demo-acme-storefront",
    });
  });

  it("doesn't load it twice", async () => {
    const { service, deps } = build({ records: LOADED });

    await service.load();

    expect(deps.seeder.seed).not.toHaveBeenCalled();
  });

  it("won't load over a real space with the demo's name", async () => {
    const { service, deps } = build({ nameTaken: true });

    await expect(service.load()).rejects.toMatchObject({ code: SETUP_SERVICE_ERROR_CODE.SPACE_EXISTS });
    expect(deps.seeder.seed).not.toHaveBeenCalled();
  });

  it("removes what it wrote when loading fails part way", async () => {
    const { service, calls } = build({ seedFails: true });

    await expect(service.load()).rejects.toThrow("insert failed");
    expect(calls).toEqual(["jobs:", "user:u1", "clear"]);
  });

  it("removes exactly what it loaded, runs first", async () => {
    const { service, calls } = build({ records: LOADED });

    await service.remove();

    expect(calls).toEqual(["jobs:j1,j2", "project:demo-project", "clanker:c1", "user:u1", "clear"]);
    await expect(service.getDemo()).resolves.toBeNull();
  });
});
