import { AppDataGrantService, type AppDataGrantDependencies } from "../../../../services/apps/AppDataGrantService";

const copiedAt = new Date("2026-11-05T10:00:00.000Z");
const waiting = { id: "old", projectId: "space-1", ticketId: "task-1", grantedBy: "user-1", copiedAt, objectKey: "spaces/space-1/data-grants/old/app.db", bytes: 10, turnId: null, takenAt: null };

function setup(overrides: { canGrantAppData?: boolean; backingKind?: string; untaken?: typeof waiting | null } = {}) {
  const deps = {
    policy: { describe: jest.fn().mockResolvedValue({ canGrantAppData: overrides.canGrantAppData ?? true }) },
    owners: { projectIdForTask: jest.fn().mockResolvedValue("space-1") },
    tickets: { getSummary: jest.fn().mockResolvedValue({ backingKind: overrides.backingKind ?? "app" }) },
    grants: {
      untaken: jest.fn().mockResolvedValue(overrides.untaken ?? null),
      insert: jest.fn(async (grant) => ({ ...grant, turnId: null, takenAt: null })),
      markRemoved: jest.fn(),
    },
    copier: { copy: jest.fn().mockResolvedValue({ bytes: 4096, copiedAt }), remove: jest.fn().mockResolvedValue(undefined) },
    users: { findById: jest.fn().mockResolvedValue({ name: "Jussi" }) },
    activity: { record: jest.fn() },
    audit: { record: jest.fn() },
  };
  return { deps, service: new AppDataGrantService(deps as unknown as AppDataGrantDependencies) };
}

describe("AppDataGrantService", () => {
  it("copies the live data for the task's next turn and says so in the thread", async () => {
    const { deps, service } = setup();

    const grant = await service.grant("user-1", "task-1");

    const key = deps.copier.copy.mock.calls[0][1];
    expect(deps.copier.copy).toHaveBeenCalledWith("space-1", expect.stringMatching(/^spaces\/space-1\/data-grants\/[0-9a-f-]{36}\/app\.db$/));
    expect(deps.grants.insert).toHaveBeenCalledWith(expect.objectContaining({ projectId: "space-1", ticketId: "task-1", grantedBy: "user-1", objectKey: key, bytes: 4096 }));
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "human", userId: "user-1" }, "app_data_granted", { copiedAt: copiedAt.toISOString() });
    expect(deps.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "app.data_granted", target: { type: "space", id: "space-1" } }));
    expect(grant).toEqual({ id: expect.any(String), copiedAt: copiedAt.toISOString(), grantedBy: "Jussi" });
  });

  it("replaces a copy no turn has taken yet", async () => {
    const { deps, service } = setup({ untaken: waiting });

    await service.grant("user-1", "task-1");

    expect(deps.grants.markRemoved).toHaveBeenCalledWith("old");
    expect(deps.copier.remove).toHaveBeenCalledWith(waiting.objectKey);
  });

  it("refuses someone who isn't a maintainer, without copying anything", async () => {
    const { deps, service } = setup({ canGrantAppData: false });

    await expect(service.grant("user-2", "task-1")).rejects.toMatchObject({ code: "NOT_ALLOWED", statusCode: 403 });
    expect(deps.copier.copy).not.toHaveBeenCalled();
  });

  it("refuses a task outside an App space", async () => {
    const { deps, service } = setup({ backingKind: "git" });

    await expect(service.grant("user-1", "task-1")).rejects.toMatchObject({ code: "NOT_AN_APP_SPACE" });
    expect(deps.copier.copy).not.toHaveBeenCalled();
  });

  it("withdraws the waiting copy and deletes it", async () => {
    const { deps, service } = setup({ untaken: waiting });

    await service.withdraw("user-1", "task-1");

    expect(deps.copier.remove).toHaveBeenCalledWith(waiting.objectKey);
    expect(deps.activity.record).toHaveBeenCalledWith("task-1", { type: "human", userId: "user-1" }, "app_data_grant_withdrawn", {});
  });

  it("has nothing to withdraw once a turn took the copy", async () => {
    const { service } = setup();
    await expect(service.withdraw("user-1", "task-1")).rejects.toMatchObject({ code: "GRANT_NOT_FOUND" });
  });
});
