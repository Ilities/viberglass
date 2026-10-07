import { WebhookPlanRequester } from "../../../webhooks/WebhookPlanRequester";
import { TASK_TURN_ERROR_CODE, TaskTurnError } from "../../../services/errors/TaskTurnError";

jest.mock("../../../config/logger", () => ({ __esModule: true, default: { warn: jest.fn() } }));

function asked(jobId: string | null) {
  return { job: { id: jobId, status: jobId ? "pending" : "queued" } };
}

describe("WebhookPlanRequester", () => {
  it("asks the task's agent to write the plan, as a webhook with nobody asking", async () => {
    const turns = { ask: jest.fn().mockResolvedValue(asked("job-1")) };

    await expect(new WebhookPlanRequester(turns).request("t-1")).resolves.toBe("job-1");
    expect(turns.ask).toHaveBeenCalledWith("t-1", null, { message: "", action: "plan", fromWebhook: true });
  });

  it("has no job yet while the plan waits behind a running turn", async () => {
    const turns = { ask: jest.fn().mockResolvedValue(asked(null)) };

    await expect(new WebhookPlanRequester(turns).request("t-1")).resolves.toBeUndefined();
  });

  it("keeps the delivery when the plan can't start", async () => {
    const turns = { ask: jest.fn().mockRejectedValue(new TaskTurnError(TASK_TURN_ERROR_CODE.NO_AGENT, "There's no agent")) };

    await expect(new WebhookPlanRequester(turns).request("t-1")).resolves.toBeUndefined();
  });
});
