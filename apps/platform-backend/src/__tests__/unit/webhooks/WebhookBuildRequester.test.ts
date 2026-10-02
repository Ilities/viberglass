import { WebhookBuildRequester } from "../../../webhooks/WebhookBuildRequester";
import { TASK_TURN_ERROR_CODE, TaskTurnError } from "../../../services/errors/TaskTurnError";

jest.mock("../../../config/logger", () => ({ __esModule: true, default: { warn: jest.fn() } }));

function asked(jobId: string | null) {
  return { job: { id: jobId, status: jobId ? "pending" : "queued" } };
}

describe("WebhookBuildRequester", () => {
  it("asks the task's agent to build, as a webhook with nobody asking", async () => {
    const turns = { ask: jest.fn().mockResolvedValue(asked("job-1")) };

    await expect(new WebhookBuildRequester(turns).request("t-1")).resolves.toBe("job-1");
    expect(turns.ask).toHaveBeenCalledWith("t-1", null, { message: "", action: "code", fromWebhook: true });
  });

  it("has no job yet while the build waits behind a running turn", async () => {
    const turns = { ask: jest.fn().mockResolvedValue(asked(null)) };

    await expect(new WebhookBuildRequester(turns).request("t-1")).resolves.toBeUndefined();
  });

  it("keeps the delivery when the build can't start", async () => {
    const turns = { ask: jest.fn().mockRejectedValue(new TaskTurnError(TASK_TURN_ERROR_CODE.NO_AGENT, "There's no agent")) };

    await expect(new WebhookBuildRequester(turns).request("t-1")).resolves.toBeUndefined();
  });
});
