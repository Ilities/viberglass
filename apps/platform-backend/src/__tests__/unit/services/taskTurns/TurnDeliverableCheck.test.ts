import { TurnDeliverableCheck } from "../../../../services/taskTurns/TurnDeliverableCheck";

function check(openQuestion = false) {
  const questions = { hasOpenForTurn: jest.fn().mockResolvedValue(openQuestion) };
  return { questions, check: new TurnDeliverableCheck(questions) };
}

const plan = { id: "turn-1", action: "plan" } as const;
const build = { id: "turn-1", action: "code" } as const;

describe("TurnDeliverableCheck", () => {
  it("names the plan a plan turn came back without", async () => {
    const { check: deliverable } = check();
    await expect(deliverable.missing(plan, { jobKind: "planning", documents: {} })).resolves.toBe("plan");
    await expect(deliverable.missing(plan, { jobKind: "planning", documents: { plan: "  \n" } })).resolves.toBe("plan");
  });

  it("counts a plan turn that wrote only a summary as missing the plan", async () => {
    const { check: deliverable } = check();
    await expect(deliverable.missing(plan, { jobKind: "planning", documents: { summary: "# Summary" } })).resolves.toBe("plan");
  });

  it("names the change a build came back without", async () => {
    const { check: deliverable } = check();
    await expect(deliverable.missing(build, { jobKind: "execution", documents: {} })).resolves.toBe("change");
    await expect(deliverable.missing(build, { jobKind: "execution", documents: { plan: "# Plan, rewritten" } })).resolves.toBe("change");
  });

  it("accepts a turn that delivered what it was asked for", async () => {
    const { questions, check: deliverable } = check();
    await expect(deliverable.missing(plan, { jobKind: "planning", documents: { plan: "# Plan" } })).resolves.toBeNull();
    await expect(deliverable.missing(build, { jobKind: "execution", documents: {}, commitHash: "abc123" })).resolves.toBeNull();
    expect(questions.hasOpenForTurn).not.toHaveBeenCalled();
  });

  it("treats a turn that stopped to ask a question as waiting, not incomplete", async () => {
    const { questions, check: waiting } = check(true);
    await expect(waiting.missing(plan, { jobKind: "planning", documents: undefined })).resolves.toBeNull();
    await expect(waiting.missing(build, { jobKind: "execution", documents: undefined })).resolves.toBeNull();
    expect(questions.hasOpenForTurn).toHaveBeenCalledWith("turn-1");
  });

  it("expects nothing in particular from replies, summaries, or a Files space's build, which saves files", async () => {
    const { check: other } = check();
    for (const action of ["reply", "summarise", null] as const) {
      await expect(other.missing({ id: "turn-1", action }, { jobKind: "reply", documents: {} })).resolves.toBeNull();
    }
    await expect(other.missing(build, { jobKind: "reply", documents: {} })).resolves.toBeNull();
  });
});
