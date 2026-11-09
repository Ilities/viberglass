import type { AppPower, AppView } from "@viberglass/types";
import { ClawAppActions } from "../../../../services/claw/ClawAppActions";
import { clawExecution, clawSchedule } from "../../../helpers/clawFixtures";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const EXECUTION = clawExecution();
const schedule = clawSchedule;

function build() {
  const deps = {
    power: { setPower: jest.fn<Promise<AppView>, [string, AppPower]>() },
    data: { orderRestore: jest.fn(async () => true) },
    executions: {
      recordExecutionResult: jest.fn(async () => clawExecution({ status: "completed" })),
      markStarted: jest.fn(async () => undefined),
    },
    schedules: { updateLastRun: jest.fn(async () => undefined) },
    webhooks: { sendWebhook: jest.fn(async (..._args: unknown[]) => undefined) },
  };
  const actions = new ClawAppActions(() => deps.power, () => deps.data, deps.executions, deps.schedules, deps.webhooks);
  return { actions, deps };
}

describe("ClawAppActions", () => {
  it("turns the app off and completes the run at once", async () => {
    const { actions, deps } = build();

    await actions.run(schedule({ action: "app_stop" }), EXECUTION);

    expect(deps.power.setPower).toHaveBeenCalledWith("space-1", "off");
    expect(deps.executions.recordExecutionResult).toHaveBeenCalledWith("execution-1", { status: "completed", result: { power: "off" } });
    expect(deps.webhooks.sendWebhook.mock.calls.map((call) => call[2])).toEqual(["started", "completed"]);
  });

  it("orders a restore of the app's data and leaves the run open for the app to finish", async () => {
    const { actions, deps } = build();

    await actions.run(schedule({ action: "app_restore_data", backupId: "backup-1" }), EXECUTION);

    expect(deps.executions.markStarted).toHaveBeenCalledWith("execution-1");
    expect(deps.data.orderRestore).toHaveBeenCalledWith("space-1", "backup-1", "execution-1");
    expect(deps.schedules.updateLastRun).toHaveBeenCalled();
    expect(deps.executions.recordExecutionResult).not.toHaveBeenCalled();
    expect(deps.power.setPower).not.toHaveBeenCalled();
  });

  it("skips a restore while the previous one hasn't run, without counting it as a failure", async () => {
    const { actions, deps } = build();
    deps.data.orderRestore.mockResolvedValueOnce(false);

    await actions.run(schedule({ action: "app_restore_data", backupId: "backup-1" }), EXECUTION);

    expect(deps.executions.recordExecutionResult).toHaveBeenCalledWith("execution-1", {
      status: "cancelled",
      errorMessage: "The previous restore hadn't run yet, so this one was skipped.",
    });
  });

  it("lets a restore that can't be ordered fail the run", async () => {
    const { actions, deps } = build();
    deps.data.orderRestore.mockRejectedValueOnce(new Error("The backup to restore is gone."));

    await expect(actions.run(schedule({ action: "app_restore_data", backupId: "backup-1" }), EXECUTION)).rejects.toThrow("gone");
  });
});
