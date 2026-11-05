import type { AppRelease } from "@viberglass/types";
import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppReleaseSwitch } from "../../../../services/apps/AppReleaseSwitch";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const PREVIOUS = appRelease("prev");
const NEXT = appRelease("next", { commitSha: "abcdef1".padEnd(40, "0") });

function app(overrides: Partial<AppRecord> = {}): AppRecord {
  return { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: PREVIOUS.id, busySince: new Date(), rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false, ...overrides };
}

function build(results: Array<string | null>) {
  const order: string[] = [];
  const host = fakeAppHost();
  host.stop.mockImplementation(async () => void order.push("stop"));
  host.clearData.mockImplementation(async () => void order.push("clearData"));
  const deps = {
    apps: { update: jest.fn(async () => undefined) },
    releases: {
      getById: jest.fn(async (id: string) => (id === PREVIOUS.id ? PREVIOUS : null)),
      markLive: jest.fn(async () => undefined),
      markLiveFailure: jest.fn(async () => undefined),
    },
    backups: { create: jest.fn(async () => undefined) },
    data: {
      backup: jest.fn(async (_projectId: string, _backupId: string) => {
        order.push("backup");
        return { objects: 3, bytes: 300 };
      }),
      restore: jest.fn(async () => {
        order.push("restore");
        return { objects: 3, bytes: 300 };
      }),
    },
    runner: {
      run: jest.fn(async (_host: unknown, release: AppRelease) => {
        order.push(`run ${release.id}`);
        return results.shift() ?? null;
      }),
    },
  };
  const switcher = new AppReleaseSwitch(deps.apps, deps.releases, deps.backups, deps.data, deps.runner);
  return { switcher, host, deps, order };
}

describe("AppReleaseSwitch", () => {
  it("stops the running release, backs up its data, then starts the new one", async () => {
    const { switcher, host, deps, order } = build([null]);

    await expect(switcher.switchTo(host, app(), NEXT)).resolves.toEqual({ state: "running", statusMessage: null, currentReleaseId: NEXT.id });

    expect(order).toEqual(["stop", "backup", "run next"]);
    expect(host.stop).toHaveBeenCalledWith("app-space-1", 30);
    const backupId = deps.data.backup.mock.calls[0][1];
    expect(deps.backups.create).toHaveBeenCalledWith({ id: backupId, projectId: "space-1", reason: "release", releaseId: NEXT.id, fromReleaseId: PREVIOUS.id, objects: 3, bytes: 300 });
    expect(deps.releases.markLive).toHaveBeenCalledWith(NEXT.id);
  });

  it("restores the backup and starts the previous release again when the new one isn't healthy", async () => {
    const { switcher, host, deps, order } = build(["The app didn't answer on /healthz", null]);

    const outcome = await switcher.switchTo(host, app(), NEXT);

    expect(order).toEqual(["stop", "backup", "run next", "stop", "restore", "clearData", "run prev"]);
    expect(deps.data.restore).toHaveBeenCalledWith("space-1", deps.data.backup.mock.calls[0][1]);
    expect(deps.releases.markLiveFailure).toHaveBeenCalledWith(NEXT.id, "The app didn't answer on /healthz");
    expect(deps.releases.markLive).not.toHaveBeenCalled();
    expect(outcome.state).toBe("running");
    expect(outcome.currentReleaseId).toBeUndefined();
    expect(outcome.statusMessage).toContain("Release abcdef1 didn't go live: The app didn't answer on /healthz");
    expect(outcome.statusMessage).toContain("The previous release is serving again");
  });

  it("fails the app when its first release isn't healthy, undoing what it did to the data", async () => {
    const { switcher, host, order } = build(["exit code 1"]);

    const outcome = await switcher.switchTo(host, app({ currentReleaseId: null, state: "off" }), NEXT);

    expect(order).toEqual(["stop", "backup", "run next", "stop", "restore", "clearData"]);
    expect(outcome).toEqual({ state: "failed", statusMessage: "Release abcdef1 didn't go live: exit code 1" });
  });

  it("counts a release that throws while starting as not healthy", async () => {
    const { switcher, host, deps } = build([]);
    deps.runner.run.mockRejectedValueOnce(new Error("no such image")).mockResolvedValueOnce(null);

    const outcome = await switcher.switchTo(host, app(), NEXT);

    expect(deps.releases.markLiveFailure).toHaveBeenCalledWith(NEXT.id, "no such image");
    expect(outcome.state).toBe("running");
  });

  describe("rolling back", () => {
    it("brings back the release's data after backing up today's", async () => {
      const { switcher, host, deps, order } = build([null]);

      await expect(switcher.switchTo(host, app(), NEXT, { backupId: "old-data" })).resolves.toMatchObject({ currentReleaseId: NEXT.id });

      expect(order).toEqual(["stop", "backup", "restore", "clearData", "run next"]);
      expect(deps.backups.create).toHaveBeenCalledWith(expect.objectContaining({ reason: "rollback", fromReleaseId: PREVIOUS.id }));
      expect(deps.data.restore).toHaveBeenCalledWith("space-1", "old-data");
    });

    it("keeps today's data when only the code goes back", async () => {
      const { switcher, host, order } = build([null]);

      await switcher.switchTo(host, app(), NEXT, { backupId: null });

      expect(order).toEqual(["stop", "backup", "run next"]);
    });

    it("goes back to the previous release and today's data, without failing the release, when it isn't healthy", async () => {
      const { switcher, host, deps, order } = build(["exit code 1", null]);

      const outcome = await switcher.switchTo(host, app(), NEXT, { backupId: "old-data" });

      expect(order).toEqual(["stop", "backup", "restore", "clearData", "run next", "stop", "restore", "clearData", "run prev"]);
      expect(deps.data.restore).toHaveBeenLastCalledWith("space-1", deps.data.backup.mock.calls[0][1]);
      expect(deps.releases.markLiveFailure).not.toHaveBeenCalled();
      expect(outcome.statusMessage).toContain("Rolling back to release abcdef1 didn't work: exit code 1");
    });
  });
});
