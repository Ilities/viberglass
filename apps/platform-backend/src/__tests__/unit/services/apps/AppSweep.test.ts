import { AppSweep } from "../../../../services/apps/AppSweep";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = new Date("2026-11-03T12:00:00Z");
const EXISTING = { projectId: "has-app", power: "on" as const, state: "running" as const, statusMessage: null, currentReleaseId: "r", busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false };

function build() {
  const host = fakeAppHost();
  const deps = {
    host,
    spaces: { listSweptIds: jest.fn(async () => ["has-app", "first-release", "nothing-built"]) },
    apps: {
      get: jest.fn(async (projectId: string) => (projectId === "has-app" ? EXISTING : null)),
      ensure: jest.fn(async () => EXISTING),
    },
    releases: { newestLiveCandidate: jest.fn(async (projectId: string) => (projectId === "nothing-built" ? null : appRelease("r", { projectId }))) },
    reconciler: { reconcile: jest.fn(async (projectId: string) => projectId !== "nothing-built") },
  };
  return { sweep: new AppSweep(deps.spaces, deps.apps, deps.releases, deps.reconciler, () => host), deps };
}

describe("AppSweep", () => {
  it("gives a space its app with its first release and reconciles every app", async () => {
    const { sweep, deps } = build();

    await expect(sweep.sweep(NOW)).resolves.toBe(2);
    expect(deps.apps.ensure.mock.calls).toEqual([["first-release"]]);
    expect(deps.reconciler.reconcile.mock.calls).toHaveLength(3);
    for (const id of ["has-app", "first-release", "nothing-built"]) expect(deps.reconciler.reconcile).toHaveBeenCalledWith(id, NOW);
  });

  it("reconnects the platform to this installation's apps first, and carries on when it can't", async () => {
    const { sweep, deps } = build();
    deps.host.rejoinPlatform.mockRejectedValueOnce(new Error("docker is down"));

    await expect(sweep.sweep(NOW)).resolves.toBe(2);
    expect(deps.host.rejoinPlatform).toHaveBeenCalledWith(["has-app", "first-release", "nothing-built"]);
  });
});
