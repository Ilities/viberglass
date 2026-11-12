import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppService } from "../../../../services/apps/AppService";
import { AppSpaceError } from "../../../../services/apps/AppSpaceError";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const LIVE = appRelease("live", { wentLiveAt: "2026-11-03T12:02:00.000Z" });
const NEWER = appRelease("newer");

const origins = { originFor: (slug: string) => `https://${slug}.apps.example.com` };

/** A release as the page gets it, without its build log. */
const shown = ({ buildLog: _log, ...release }: typeof LIVE) => release;

function preview(id: string, state: "off" | "running" | "failed", ticketId: string) {
  return { id, address: `preview-${id}`, projectId: "space-1", ticketId, pullRequestUrl: "https://x/pull/1", commitSha: "f".repeat(40), releaseId: null, runningReleaseId: null, power: "on" as const, state, statusMessage: state === "failed" ? "exit code 1" : null, busySince: null, startedAt: null, lastOpenedAt: null, triedCommitSha: null };
}

function build(app: AppRecord | null, isApp = true, archived = false) {
  const host = fakeAppHost();
  const deps = {
    spaces: {
      findById: jest.fn(async () => (isApp ? { projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: false } : null)),
      isArchived: jest.fn(async () => archived),
    },
    apps: {
      get: jest.fn(async () => app),
      ensure: jest.fn(async () => app ?? { projectId: "space-1", power: "on" as const, state: "off" as const, statusMessage: null, currentReleaseId: null, busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false, dataRestore: null, backupDue: false }),
      update: jest.fn(async () => undefined),
      turnOffForArchive: jest.fn(async () => undefined),
    },
    releases: { listForProject: jest.fn(async () => [NEWER, LIVE]), getById: jest.fn(async () => LIVE) },
    backups: { dataPoints: jest.fn(async () => [{ backupId: "b1", releaseId: LIVE.id, takenAt: new Date("2026-11-03T13:00:00.000Z") }]) },
    reconciler: { reconcile: jest.fn(async () => true) },
    previews: { listForProject: jest.fn(async () => [preview("p2", "running", "t-2"), preview("p1", "off", "t-1")]) },
    tasks: { refsFor: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { key: id.toUpperCase(), title: `Task ${id}` }]))) },
  };
  return {
    service: new AppService(deps.spaces, deps.apps, deps.releases, deps.backups, deps.reconciler, () => host, origins, deps.previews, deps.tasks),
    deps,
    host,
  };
}

const failed: AppRecord = { projectId: "space-1", power: "on", state: "failed", statusMessage: "exit code 1", currentReleaseId: "live", busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false, dataRestore: null, backupDue: false };

describe("AppService", () => {
  it("shows an app that has no release yet as on but not running", async () => {
    const { service } = build(null);

    await expect(service.view("space-1")).resolves.toEqual({
      power: "on",
      state: "off",
      statusMessage: null,
      currentRelease: null,
      releases: [shown(NEWER), shown(LIVE)],
      tasks: { "t-2": { key: "T-2", title: "Task t-2" } },
      previews: [{ id: "p2", taskId: "t-2", state: "running", statusMessage: null }],
      dataPoints: { [LIVE.id]: "2026-11-03T13:00:00.000Z" },
      rollback: null,
      backupDue: false,
      dataRestoreDue: false,
      url: "https://laptops.apps.example.com",
    });
  });

  it("shows the current release among the releases", async () => {
    const { service, deps } = build({ ...failed, state: "running", statusMessage: null });

    await expect(service.view("space-1")).resolves.toMatchObject({ state: "running", currentRelease: shown(LIVE) });
    expect(deps.releases.getById).not.toHaveBeenCalled();
  });

  it("leaves build logs out of the view, and gives one only for the app's own release", async () => {
    const { service, deps } = build(null);

    const view = await service.view("space-1");
    expect(view.releases.every((release) => !("buildLog" in release))).toBe(true);

    deps.releases.getById.mockResolvedValueOnce({ ...LIVE, buildLog: "npm run build" });
    await expect(service.buildLog("space-1", LIVE.id)).resolves.toEqual({ buildLog: "npm run build" });
    deps.releases.getById.mockResolvedValueOnce({ ...LIVE, projectId: "space-2" });
    await expect(service.buildLog("space-1", LIVE.id)).resolves.toBeNull();
  });

  it("refuses spaces that aren't App spaces", async () => {
    const { service } = build(null, false);

    await expect(service.view("space-1")).rejects.toThrow(AppSpaceError);
  });

  it("retries a failed app when it's turned on again, in the background", async () => {
    const { service, deps } = build(failed);

    await service.setPower("space-1", "on");

    expect(deps.apps.update).toHaveBeenCalledWith("space-1", { power: "on", state: "off", statusMessage: null });
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("space-1");
  });

  it("turns an app off", async () => {
    const { service, deps } = build({ ...failed, state: "running" });

    await service.setPower("space-1", "off");

    expect(deps.apps.update).toHaveBeenCalledWith("space-1", { power: "off" });
  });

  it("reads the app's logs from its host", async () => {
    const { service, host } = build(failed);
    host.logs.mockResolvedValue("listening on 3000\n");

    await expect(service.logs("space-1")).resolves.toBe("listening on 3000\n");
    expect(host.logs).toHaveBeenCalledWith("app-space-1", 300);
  });

  it("keeps an archived space's app off", async () => {
    const { service, deps } = build(failed, true, true);

    await expect(service.setPower("space-1", "on")).rejects.toMatchObject({ code: "ARCHIVED" });
    expect(deps.apps.update).not.toHaveBeenCalled();
    await expect(service.setPower("space-1", "off")).resolves.toBeDefined();
  });

  it("turns an archived space's app off, owing a copy of its data when it had a release", async () => {
    const { service, deps } = build(failed);

    await service.turnOffForArchive("space-1");

    expect(deps.apps.turnOffForArchive).toHaveBeenCalledWith("space-1", true);
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("space-1");
  });

  it("owes no copy for an app that never had a release, and does nothing without an app", async () => {
    const neverReleased = build({ ...failed, currentReleaseId: null });
    await neverReleased.service.turnOffForArchive("space-1");
    expect(neverReleased.deps.apps.turnOffForArchive).toHaveBeenCalledWith("space-1", false);

    const none = build(null);
    await none.service.turnOffForArchive("space-1");
    expect(none.deps.apps.turnOffForArchive).not.toHaveBeenCalled();
    expect(none.deps.reconciler.reconcile).not.toHaveBeenCalled();
  });
});
