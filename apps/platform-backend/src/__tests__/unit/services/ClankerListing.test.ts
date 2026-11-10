import type { Clanker } from "@viberglass/types";
import { ClankerListing } from "../../../services/ClankerListing";

function runner(overrides: Partial<Clanker> = {}): Clanker {
  return {
    id: "c-1",
    name: "Claude",
    slug: "claude",
    deploymentStrategyId: "docker",
    deploymentConfig: null,
    configFiles: [],
    agent: "claude-code",
    secretBindings: [],
    mcpServerIds: [],
    skillIds: [],
    status: "active",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const READY = { state: "ready" as const, problem: null, lastRun: null };

function listing(stored: Clanker[], availability: { status: Clanker["status"]; statusMessage?: string }) {
  const clankers = {
    listClankers: jest.fn(async () => stored),
    updateStatus: jest.fn(async (id: string, status: Clanker["status"], statusMessage: string | null) =>
      runner({ id, status, statusMessage }),
    ),
  };
  const provisioning = { resolveAvailabilityStatus: jest.fn(async () => availability) };
  const readiness = {
    withReadiness: jest.fn(async (list: Clanker[]) => list.map((clanker) => ({ ...clanker, readiness: READY }))),
    one: jest.fn(async (clanker: Clanker) => ({ ...clanker, readiness: READY })),
  };
  return { subject: new ClankerListing(clankers, provisioning, readiness), clankers, provisioning };
}

describe("ClankerListing", () => {
  it("lists runners with the status their compute reports and their readiness", async () => {
    const { subject, clankers } = listing([runner()], { status: "inactive", statusMessage: "Container gone" });
    const [listed] = await subject.list(50, 0);
    expect(clankers.updateStatus).toHaveBeenCalledWith("c-1", "inactive", "Container gone");
    expect(listed).toMatchObject({ status: "inactive", readiness: READY });
  });

  it("leaves a deploying runner alone", async () => {
    const { subject, provisioning, clankers } = listing([], { status: "inactive" });
    expect(await subject.refreshStatus(runner({ status: "deploying" }))).toMatchObject({ status: "deploying" });
    expect(provisioning.resolveAvailabilityStatus).not.toHaveBeenCalled();
    expect(clankers.updateStatus).not.toHaveBeenCalled();
  });

  it("keeps a runner whose status hasn't changed", async () => {
    const { subject, clankers } = listing([], { status: "active" });
    expect(await subject.current(runner())).toMatchObject({ status: "active", readiness: READY });
    expect(clankers.updateStatus).not.toHaveBeenCalled();
  });

  it("names the image the runner's runs start from now", async () => {
    const originalTag = process.env.VIBERATOR_WORKER_IMAGE_TAG;
    process.env.VIBERATOR_WORKER_IMAGE_TAG = "v1.2.2";
    const { subject } = listing([], { status: "active" });
    const published = runner({
      agent: "opencode",
      deploymentConfig: { version: 1, strategy: { type: "kubernetes" }, agent: { type: "opencode" } },
    });

    try {
      expect((await subject.current(published)).workerImage).toMatch(/viberator-worker-opencode:v1\.2\.2$/);
    } finally {
      if (originalTag === undefined) delete process.env.VIBERATOR_WORKER_IMAGE_TAG;
      else process.env.VIBERATOR_WORKER_IMAGE_TAG = originalTag;
    }
  });
});
