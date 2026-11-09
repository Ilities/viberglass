import type { ClawExecution } from "@viberglass/types";
import { ClawAppRestoreCompletion } from "../../../../services/claw/ClawAppRestoreCompletion";
import { clawExecution, clawSchedule } from "../../../helpers/clawFixtures";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SCHEDULE = clawSchedule({ action: "app_restore_data", backupId: "backup-1" });

function build(finished: ClawExecution | null = clawExecution()) {
  const deps = {
    executions: { recordExecutionResult: jest.fn(async () => finished) },
    schedules: { getSchedule: jest.fn(async () => SCHEDULE), pauseSchedule: jest.fn(async () => SCHEDULE) },
    webhooks: { sendWebhook: jest.fn(async (..._args: unknown[]) => undefined) },
  };
  const completion = new ClawAppRestoreCompletion(deps.executions, deps.schedules, deps.webhooks);
  return { completion, deps };
}

describe("ClawAppRestoreCompletion", () => {
  it("completes the run once the data is back", async () => {
    const { completion, deps } = build();

    await completion.finish("execution-1", null);

    expect(deps.executions.recordExecutionResult).toHaveBeenCalledWith("execution-1", { status: "completed", result: { restored: true } });
    expect(deps.schedules.pauseSchedule).not.toHaveBeenCalled();
    expect(deps.webhooks.sendWebhook.mock.calls[0][2]).toBe("completed");
  });

  it("fails the run and pauses the schedule when the restore failed", async () => {
    const { completion, deps } = build();

    await completion.finish("execution-1", "storage down");

    expect(deps.executions.recordExecutionResult).toHaveBeenCalledWith("execution-1", { status: "failed", errorMessage: "storage down" });
    expect(deps.schedules.pauseSchedule).toHaveBeenCalledWith("schedule-1");
    expect(deps.webhooks.sendWebhook.mock.calls[0][2]).toBe("failed");
  });

  it("does nothing more for a run that had already ended", async () => {
    const { completion, deps } = build(null);

    await completion.finish("execution-1", "storage down");

    expect(deps.schedules.pauseSchedule).not.toHaveBeenCalled();
    expect(deps.webhooks.sendWebhook).not.toHaveBeenCalled();
  });
});
