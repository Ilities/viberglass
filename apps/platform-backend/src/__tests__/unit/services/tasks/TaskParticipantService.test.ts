import { TaskParticipantService } from "../../../../services/tasks/TaskParticipantService";
import { SPACE_ACCESS_ERROR_CODE, SpaceAccessError } from "../../../../services/errors/SpaceAccessError";

const at = new Date("2026-09-30T10:00:00Z");

function setup(options: { canSee: boolean; deactivated?: boolean }) {
  const participants = {
    list: jest.fn().mockResolvedValue([]),
    setOwner: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(true),
  };
  const users = {
    findById: jest.fn().mockResolvedValue({
      id: "user-2",
      email: "g@example.com",
      name: "G",
      avatarUrl: null,
      role: "guest",
      createdAt: at,
      updatedAt: at,
      deactivatedAt: options.deactivated ? at : null,
    }),
  };
  const owners = { projectIdForTask: jest.fn().mockResolvedValue("space-1") };
  const access = {
    assertCanSee: jest.fn(async () => {
      if (!options.canSee) throw new SpaceAccessError(SPACE_ACCESS_ERROR_CODE.NOT_FOUND, "Space not found");
      return { projectId: "space-1", membership: null };
    }),
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const mentions = { mentionOnOpenReview: jest.fn().mockResolvedValue(true) };
  return { participants, activity, mentions, service: new TaskParticipantService({ participants, users, owners, access, activity, mentions }) };
}

describe("TaskParticipantService", () => {
  it("makes someone the owner when they can see the task", async () => {
    const { participants, service } = setup({ canSee: true });

    await service.setOwner("task-1", "user-2", "user-1");

    expect(participants.setOwner).toHaveBeenCalledWith("task-1", "user-2", "user-1");
  });

  it("refuses to put someone on a task in a space they can't see", async () => {
    const { participants, service } = setup({ canSee: false });

    await expect(service.add("task-1", "user-2", "reviewer", "user-1")).rejects.toMatchObject({ code: "PERSON_CANT_SEE_TASK" });
    expect(participants.add).not.toHaveBeenCalled();
  });

  it("asks a reviewer added later to review what's already waiting, and not a watcher", async () => {
    const { mentions, service } = setup({ canSee: true });

    await service.add("task-1", "user-2", "reviewer", "user-1");
    await service.add("task-1", "user-3", "watcher", "user-1");

    expect(mentions.mentionOnOpenReview).toHaveBeenCalledTimes(1);
    expect(mentions.mentionOnOpenReview).toHaveBeenCalledWith("task-1", "user-2");
  });

  it("refuses a deactivated person", async () => {
    const { service } = setup({ canSee: true, deactivated: true });

    await expect(service.assertCanSeeSpace("space-1", "user-2")).rejects.toMatchObject({ code: "PERSON_CANT_SEE_TASK" });
  });

  it("keeps the requester, and replaces rather than removes the owner", async () => {
    const { service } = setup({ canSee: true });

    await expect(service.remove("task-1", "user-2", "requester", "user-1")).rejects.toMatchObject({ code: "ROLE_NOT_CHANGEABLE" });
    await expect(service.remove("task-1", "user-2", "owner", "user-1")).rejects.toMatchObject({ code: "ROLE_NOT_CHANGEABLE" });
    await expect(service.add("task-1", "user-2", "owner", "user-1")).rejects.toMatchObject({ code: "ROLE_NOT_CHANGEABLE" });
  });

  it("removes a watcher and records who did it", async () => {
    const setupActivity = setup({ canSee: true });
    const { participants, service } = setupActivity;

    const { activity } = setupActivity;
    await service.remove("task-1", "user-2", "watcher", "user-1");

    expect(participants.remove).toHaveBeenCalledWith("task-1", "user-2", "watcher");
    expect(activity.record).toHaveBeenCalledWith("task-1", { type: "human", userId: "user-1" }, "watcher_removed", { userId: "user-2" });
  });
});
