import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppService } from "../../../../services/apps/AppService";
import { AppSpaceError } from "../../../../services/apps/AppSpaceError";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const LIVE = appRelease("live", { wentLiveAt: "2026-11-03T12:02:00.000Z" });
const NEWER = appRelease("newer");

function build(app: AppRecord | null, isApp = true) {
  const host = fakeAppHost();
  const deps = {
    spaces: { isAppSpace: jest.fn(async () => isApp) },
    apps: {
      get: jest.fn(async () => app),
      ensure: jest.fn(async () => app ?? { projectId: "space-1", power: "on" as const, state: "off" as const, statusMessage: null, currentReleaseId: null, busySince: null }),
      update: jest.fn(async () => undefined),
    },
    releases: { listForProject: jest.fn(async () => [NEWER, LIVE]), getById: jest.fn(async () => LIVE) },
    reconciler: { reconcile: jest.fn(async () => true) },
  };
  return { service: new AppService(deps.spaces, deps.apps, deps.releases, deps.reconciler, () => host), deps, host };
}

const failed: AppRecord = { projectId: "space-1", power: "on", state: "failed", statusMessage: "exit code 1", currentReleaseId: "live", busySince: null };

describe("AppService", () => {
  it("shows an app that has no release yet as on but not running", async () => {
    const { service } = build(null);

    await expect(service.view("space-1")).resolves.toEqual({
      power: "on",
      state: "off",
      statusMessage: null,
      currentRelease: null,
      releases: [NEWER, LIVE],
    });
  });

  it("shows the current release among the releases", async () => {
    const { service, deps } = build({ ...failed, state: "running", statusMessage: null });

    await expect(service.view("space-1")).resolves.toMatchObject({ state: "running", currentRelease: LIVE });
    expect(deps.releases.getById).not.toHaveBeenCalled();
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
    expect(host.logs).toHaveBeenCalledWith("space-1", 300);
  });
});
