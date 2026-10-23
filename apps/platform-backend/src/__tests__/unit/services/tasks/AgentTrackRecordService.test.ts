import { AgentTrackRecordService } from "../../../../services/tasks/AgentTrackRecordService";
import type { CreditedTask } from "../../../../persistence/ticketing/AgentTrackRecordDAO";

function task(key: string, agent: string, model: string | null): CreditedTask {
  return {
    ticketId: key,
    key,
    title: key,
    agent,
    model,
    pullRequest: null,
    built: false,
    planRounds: 1,
    questions: 0,
    takenOver: false,
    runs: 1,
    failedRuns: 0,
    reviewComments: null,
    costUsd: null,
    costEstimated: false,
  };
}

describe("AgentTrackRecordService", () => {
  it("groups the tasks by harness and model, the busiest first, keeping each group's order", async () => {
    const tasksOf = jest.fn().mockResolvedValue([
      task("WEB-4", "harness-a", "model-1"),
      task("WEB-3", "harness-b", null),
      task("WEB-2", "harness-a", "model-1"),
      task("WEB-1", "harness-a", "model-2"),
    ]);

    const { entries } = await new AgentTrackRecordService({ tasksOf }).trackRecord("space-1");

    expect(tasksOf).toHaveBeenCalledWith("space-1");
    expect(entries.map((entry) => [entry.agent, entry.model, entry.tasks.map((t) => t.key)])).toEqual([
      ["harness-a", "model-1", ["WEB-4", "WEB-2"]],
      ["harness-b", null, ["WEB-3"]],
      ["harness-a", "model-2", ["WEB-1"]],
    ]);
    expect(entries[0].tasks[0]).not.toHaveProperty("agent");
  });
});
