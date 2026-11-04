import { AppRollbackSettler } from "../../../../services/apps/AppRollbackSettler";
import { appRelease } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const TARGET = appRelease("target", { commitSha: "1234567".padEnd(40, "0") });
const ORDER = { releaseId: TARGET.id, backupId: null, requestedBy: "user-1" };

function build() {
  const deps = {
    releases: { setAsideAfter: jest.fn(async () => [appRelease("with-task", { ticketId: "task-1" }), appRelease("without-task")]) },
    apps: { clearRollback: jest.fn(async () => undefined) },
    users: { findById: jest.fn().mockResolvedValue({ id: "user-1", name: "Ada" }) },
    activity: { record: jest.fn(async () => undefined) },
  };
  return { settler: new AppRollbackSettler(deps.releases, deps.apps, deps.users, deps.activity), deps };
}

describe("AppRollbackSettler", () => {
  it("sets the newer releases aside, clears the order and tells their tasks", async () => {
    const { settler, deps } = build();

    await settler.settle(TARGET, ORDER);

    expect(deps.releases.setAsideAfter).toHaveBeenCalledWith(TARGET);
    expect(deps.apps.clearRollback).toHaveBeenCalledWith("space-1", TARGET.id);
    expect(deps.activity.record).toHaveBeenCalledTimes(1);
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "human", userId: "user-1" }, "release_rolled_back", {
      releaseId: "with-task",
      commitSha: expect.any(String),
      toCommitSha: TARGET.commitSha,
      rolledBackBy: "Ada",
    });
  });

  it("doesn't let a task it couldn't tell undo the rollback", async () => {
    const { settler, deps } = build();
    deps.activity.record.mockRejectedValueOnce(new Error("database unreachable"));

    await expect(settler.settle(TARGET, ORDER)).resolves.toBeUndefined();
  });
});
