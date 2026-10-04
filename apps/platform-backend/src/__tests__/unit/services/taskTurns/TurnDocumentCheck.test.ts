import { TurnDocumentCheck } from "../../../../services/taskTurns/TurnDocumentCheck";

function check(openQuestion = false) {
  const questions = { hasOpenForTurn: jest.fn().mockResolvedValue(openQuestion) };
  return { questions, check: new TurnDocumentCheck(questions) };
}

describe("TurnDocumentCheck", () => {
  it("names the document a research or plan turn came back without", async () => {
    const { check: research } = check();
    await expect(research.missing({ id: "turn-1", action: "research" }, {})).resolves.toBe("research");
    await expect(research.missing({ id: "turn-1", action: "plan" }, { plan: "  \n" })).resolves.toBe("plan");
  });

  it("counts a turn that wrote another document but not the one asked for as missing it", async () => {
    const { check: research } = check();
    await expect(research.missing({ id: "turn-1", action: "research" }, { plan: "# Plan" })).resolves.toBe("research");
  });

  it("accepts a turn that wrote what it was asked for", async () => {
    const { questions, check: research } = check();
    await expect(research.missing({ id: "turn-1", action: "research" }, { research: "# Findings" })).resolves.toBeNull();
    expect(questions.hasOpenForTurn).not.toHaveBeenCalled();
  });

  it("treats a turn that stopped to ask a question as waiting, not incomplete", async () => {
    const { questions, check: waiting } = check(true);
    await expect(waiting.missing({ id: "turn-1", action: "plan" }, undefined)).resolves.toBeNull();
    expect(questions.hasOpenForTurn).toHaveBeenCalledWith("turn-1");
  });

  it("expects no document from replies, builds or summaries", async () => {
    const { check: other } = check();
    for (const action of ["reply", "code", "summarise", null] as const) {
      await expect(other.missing({ id: "turn-1", action }, {})).resolves.toBeNull();
    }
  });
});
