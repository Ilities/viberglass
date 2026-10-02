import { TaskAutoSummariser } from "../../../../services/taskTurns/TaskAutoSummariser";

describe("TaskAutoSummariser", () => {
  const session = { ticketId: "t-1", clankerId: "c-1" };
  const setup = () => {
    const turns = { ask: jest.fn().mockResolvedValue({}) };
    return { turns, summariser: new TaskAutoSummariser(turns, { ratio: 0.6, tokens: 120_000 }) };
  };

  it("asks the same agent for a summary once its context is past the threshold", async () => {
    const { turns, summariser } = setup();
    await expect(summariser.afterTurn(session, { action: "plan" }, { used: 130_000, size: 200_000 })).resolves.toBe(true);
    expect(turns.ask).toHaveBeenCalledWith("t-1", null, { message: "", action: "summarise", agentId: "c-1" });
  });

  it("goes by tokens when the harness doesn't say how big its context is", async () => {
    const { turns, summariser } = setup();
    await summariser.afterTurn(session, { action: "reply" }, { used: 100_000, size: null });
    expect(turns.ask).not.toHaveBeenCalled();
    await summariser.afterTurn(session, { action: "reply" }, { used: 125_000, size: null });
    expect(turns.ask).toHaveBeenCalledTimes(1);
  });

  it("doesn't summarise a summary, a turn below the threshold, or one that reported nothing", async () => {
    const { turns, summariser } = setup();
    await summariser.afterTurn(session, { action: "summarise" }, { used: 190_000, size: 200_000 });
    await summariser.afterTurn(session, { action: "plan" }, { used: 10_000, size: 200_000 });
    await summariser.afterTurn(session, { action: "plan" }, undefined);
    expect(turns.ask).not.toHaveBeenCalled();
  });

  it("never fails the turn it follows", async () => {
    const { turns, summariser } = setup();
    turns.ask.mockRejectedValue(new Error("no agent"));
    await expect(summariser.afterTurn(session, { action: "plan" }, { used: 190_000, size: 200_000 })).resolves.toBe(false);
  });
});
