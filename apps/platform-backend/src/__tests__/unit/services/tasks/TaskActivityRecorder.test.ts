import { registerActivityListener } from "../../../../services/tasks/activityListeners";
import { TaskActivityRecorder } from "../../../../services/tasks/TaskActivityRecorder";

describe("TaskActivityRecorder", () => {
  it("tells listeners registered after it was made, such as the chat mirror at startup", async () => {
    const own = { onActivity: jest.fn().mockResolvedValue(undefined) };
    const recorder = new TaskActivityRecorder({ record: jest.fn().mockResolvedValue(undefined) }, [own]);
    const later = { onActivity: jest.fn().mockRejectedValue(new Error("Slack is down")) };
    registerActivityListener(later);

    await recorder.record("t-1", { type: "agent" }, "question_asked", { questionId: "q-1" });

    const heard = { ticketId: "t-1", kind: "question_asked", actorId: null, payload: { questionId: "q-1" } };
    expect(own.onActivity).toHaveBeenCalledWith(heard);
    // A listener that fails doesn't undo the change.
    expect(later.onActivity).toHaveBeenCalledWith(heard);
  });
});
