import type { AppPreviewRecord } from "../../../../persistence/apps/AppPreviewDAO";
import { AppPreviewSweep, lastNightlyOff, turnOffReason } from "../../../../services/apps/AppPreviewSweep";
import { appPreview } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = new Date("2026-11-04T12:00:00Z");
const ENV = { APPS_PREVIEW_OFF_HOUR: "3", APPS_PREVIEW_IDLE_HOURS: "4" };
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

function build(options: { ended?: AppPreviewRecord[]; active?: AppPreviewRecord[] } = {}) {
  const deps = {
    previews: {
      listEnded: jest.fn(async () => options.ended ?? []),
      listActive: jest.fn(async () => options.active ?? []),
      update: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    },
    reconciler: { reconcile: jest.fn(async () => true), remove: jest.fn(async () => undefined) },
  };
  return { sweep: new AppPreviewSweep(deps.previews, deps.reconciler, () => ENV), deps };
}

describe("lastNightlyOff", () => {
  it("is today's hour once it has passed, and yesterday's before", () => {
    expect(lastNightlyOff(NOW, 3)).toEqual(new Date("2026-11-04T03:00:00Z"));
    expect(lastNightlyOff(new Date("2026-11-04T02:59:00Z"), 3)).toEqual(new Date("2026-11-03T03:00:00Z"));
  });
});

describe("turnOffReason", () => {
  it("turns off a preview that has run since before the night's hour", () => {
    expect(turnOffReason(appPreview({ state: "running", startedAt: new Date("2026-11-04T02:30:00Z"), lastOpenedAt: hoursAgo(0) }), NOW, ENV)).toMatch(/for the night/);
  });

  it("turns off a preview nobody opened for the idle hours, counting from its start", () => {
    expect(turnOffReason(appPreview({ state: "running", startedAt: hoursAgo(5), lastOpenedAt: hoursAgo(4) }), NOW, ENV)).toMatch(/after 4 hours/);
    expect(turnOffReason(appPreview({ state: "running", startedAt: hoursAgo(5), lastOpenedAt: hoursAgo(3) }), NOW, ENV)).toBeNull();
    expect(turnOffReason(appPreview({ state: "running", startedAt: hoursAgo(1), lastOpenedAt: null }), NOW, ENV)).toBeNull();
  });

  it("leaves previews that aren't running to their own course", () => {
    expect(turnOffReason(appPreview({ state: "building", startedAt: hoursAgo(20) }), NOW, ENV)).toBeNull();
  });
});

describe("AppPreviewSweep", () => {
  it("turns off a preview that's due and brings every active one to its wanted state", async () => {
    const idle = appPreview({ id: "pv-idle", state: "running", startedAt: hoursAgo(6) });
    const fresh = appPreview({ id: "pv-fresh", state: "running", startedAt: hoursAgo(1) });
    const { sweep, deps } = build({ active: [idle, fresh] });

    await expect(sweep.sweep(NOW)).resolves.toBe(2);

    expect(deps.previews.update).toHaveBeenCalledTimes(1);
    expect(deps.previews.update).toHaveBeenCalledWith("pv-idle", { power: "off", statusMessage: expect.stringMatching(/after 4 hours/) });
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("pv-idle", NOW);
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("pv-fresh", NOW);
  });

  it("turns off the preview of a change that ended first, and removes it once it's off", async () => {
    const running = build({ ended: [appPreview({ state: "running" })] });
    await running.sweep.sweep(NOW);
    expect(running.deps.previews.update).toHaveBeenCalledWith("pv-1", { power: "off" });
    expect(running.deps.previews.delete).not.toHaveBeenCalled();

    const off = build({ ended: [appPreview({ power: "off", state: "off" })] });
    await off.sweep.sweep(NOW);
    expect(off.deps.reconciler.remove).toHaveBeenCalledWith(expect.objectContaining({ id: "pv-1" }));
    expect(off.deps.previews.delete).toHaveBeenCalledWith("pv-1");
  });
});
