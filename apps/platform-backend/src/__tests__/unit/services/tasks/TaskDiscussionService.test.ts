import { mentionToken } from "@viberglass/types";
import { TaskDiscussionService } from "../../../../services/tasks/TaskDiscussionService";
import { TASK_PARTICIPANT_ERROR_CODE, TaskParticipantError } from "../../../../services/errors/TaskParticipantError";

const DESIGNER = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

function setup() {
  const messages = { list: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue("message-1") };
  const participants = { add: jest.fn().mockResolvedValue(undefined) };
  const visibility = {
    assertCanSeeTask: jest.fn(async (_ticketId: string, userId: string) => {
      if (userId === OUTSIDER) throw new TaskParticipantError(TASK_PARTICIPANT_ERROR_CODE.PERSON_CANT_SEE_TASK, "No");
    }),
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  return { messages, participants, activity, service: new TaskDiscussionService({ messages, participants, visibility, activity }) };
}

describe("TaskDiscussionService", () => {
  it("stores the message with its mentions, makes them watchers and records it", async () => {
    const { messages, participants, activity, service } = setup();
    const body = `Can you check the colours, ${mentionToken("Dana", DESIGNER)}?`;

    await service.post("task-1", "user-1", body);

    expect(messages.create).toHaveBeenCalledWith({ ticketId: "task-1", authorId: "user-1", body, mentionedUserIds: [DESIGNER] });
    expect(participants.add).toHaveBeenCalledWith("task-1", DESIGNER, "watcher", "user-1");
    expect(activity.record).toHaveBeenCalledWith("task-1", { type: "human", userId: "user-1" }, "message_posted", {
      messageId: "message-1",
      mentioned: [DESIGNER],
    });
  });

  it("refuses a mention of someone who can't see the task, before saving anything", async () => {
    const { messages, service } = setup();

    await expect(service.post("task-1", "user-1", `Hi ${mentionToken("Out", OUTSIDER)}`)).rejects.toMatchObject({
      code: "PERSON_CANT_SEE_TASK",
    });
    expect(messages.create).not.toHaveBeenCalled();
  });

  it("refuses an empty message", async () => {
    const { service } = setup();

    await expect(service.post("task-1", "user-1", "   ")).rejects.toMatchObject({ code: "MESSAGE_INVALID" });
  });

  it("posts a tracker comment as the matching person, or under the tracker's name for someone without an account", async () => {
    const { messages, activity, service } = setup();

    await service.createFromTracker("task-1", { userId: "user-1", name: "Maria", source: "jira" }, " Looks good ");
    await service.createFromTracker("task-1", { userId: null, name: "Pat", source: "jira" }, "Ship it");

    expect(messages.create).toHaveBeenNthCalledWith(1, {
      ticketId: "task-1",
      authorId: "user-1",
      body: "Looks good",
      mentionedUserIds: [],
      external: { source: "jira", authorName: null },
    });
    expect(messages.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ authorId: null, external: { source: "jira", authorName: "Pat" } }));
    expect(activity.record).toHaveBeenLastCalledWith("task-1", { type: "system" }, "message_posted", { messageId: "message-1", mentioned: [], source: "jira" });
  });
});
