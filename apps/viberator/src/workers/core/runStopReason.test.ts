import { runStopReason } from "./runStopReason";

describe("runStopReason", () => {
  it("is the agent's own reason on a run that succeeded", () => {
    expect(runStopReason("completed", true)).toBe("completed");
    expect(runStopReason(undefined, true)).toBe("completed");
  });

  it("is failed when the agent completed but a later step failed the run", () => {
    expect(runStopReason("completed", false)).toBe("failed");
  });

  it("is failed when the run failed before or in the agent's turn", () => {
    expect(runStopReason(undefined, false)).toBe("failed");
    expect(runStopReason("failed", false)).toBe("failed");
  });
});
