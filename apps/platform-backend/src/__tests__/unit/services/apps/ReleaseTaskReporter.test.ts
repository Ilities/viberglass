import type { AppRelease } from "@viberglass/types";
import { ReleaseTaskReporter } from "../../../../services/apps/ReleaseTaskReporter";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

function release(overrides: Partial<AppRelease> = {}): AppRelease {
  return {
    id: "release-1",
    projectId: "space-1",
    commitSha: "a".repeat(40),
    status: "ready",
    jobId: null,
    bundleSha256: "f".repeat(64),
    bundleBytes: 1,
    nodeVersion: "v24.11.0",
    buildLog: null,
    failureReason: null,
    wentLiveAt: null,
    liveFailure: null,
    ticketId: "task-1",
    createdAt: "2026-11-04T10:00:00.000Z",
    finishedAt: null,
    ...overrides,
  };
}

function setup(unreported: AppRelease[], laterLive: AppRelease | null = null) {
  const deps = {
    releases: {
      listUnreported: jest.fn().mockResolvedValue(unreported),
      laterLive: jest.fn().mockResolvedValue(laterLive),
      markReported: jest.fn().mockResolvedValue(true),
    },
    activity: { record: jest.fn() },
  };
  return { deps, reporter: new ReleaseTaskReporter(deps.releases, deps.activity) };
}

const about = { releaseId: "release-1", commitSha: "a".repeat(40) };

describe("ReleaseTaskReporter", () => {
  it("tells the task its release went live", async () => {
    const { deps, reporter } = setup([release({ wentLiveAt: "2026-11-04T10:05:00.000Z" })]);

    await expect(reporter.sweep()).resolves.toBe(1);
    expect(deps.releases.markReported).toHaveBeenCalledWith("release-1");
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "system" }, "release_live", about);
  });

  it("tells the task why the build failed", async () => {
    const { deps, reporter } = setup([release({ status: "failed", failureReason: "npm run build exited with 1" })]);

    await reporter.sweep();
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "system" }, "release_failed", { ...about, reason: "npm run build exited with 1" });
  });

  it("tells the task why the release didn't go live", async () => {
    const { deps, reporter } = setup([release({ liveFailure: "The app didn't answer on /healthz within 120 seconds" })]);

    await reporter.sweep();
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "system" }, "release_failed", {
      ...about,
      reason: "The app didn't answer on /healthz within 120 seconds",
    });
  });

  it("counts a later release going live as this change going live", async () => {
    const { deps, reporter } = setup([release()], release({ id: "release-2", commitSha: "b".repeat(40), wentLiveAt: "2026-11-04T10:09:00.000Z" }));

    await reporter.sweep();
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "system" }, "release_live", { ...about, withCommitSha: "b".repeat(40) });
  });

  it("waits for a release that is still on its way", async () => {
    const { deps, reporter } = setup([release({ status: "building" })]);

    await expect(reporter.sweep()).resolves.toBe(0);
    expect(deps.releases.markReported).not.toHaveBeenCalled();
    expect(deps.activity.record).not.toHaveBeenCalled();
  });

  it("tells a task once, when another sweep marked it first", async () => {
    const { deps, reporter } = setup([release({ wentLiveAt: "2026-11-04T10:05:00.000Z" })]);
    deps.releases.markReported.mockResolvedValue(false);

    await expect(reporter.sweep()).resolves.toBe(0);
    expect(deps.activity.record).not.toHaveBeenCalled();
  });
});
