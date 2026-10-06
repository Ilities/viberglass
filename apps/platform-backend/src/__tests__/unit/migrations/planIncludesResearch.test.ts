import * as before from "../../../migrations/102_turn_writes_what_it_was_asked_for";
import * as after from "../../../migrations/103_plan_includes_research";

// The migration edits stored templates with SQL replace(), which changes nothing
// when a string isn't found; the same edits made here show each one matched.
describe("the turn templates once research is part of the plan", () => {
  it("drop every mention of research", () => {
    expect(before.TASK_TURN_TEMPLATE).toMatch(/research/i);
    expect(before.TASK_TURN_COLD_START_TEMPLATE).toMatch(/research/i);

    expect(after.TASK_TURN_TEMPLATE).not.toMatch(/research/i);
    expect(after.TASK_TURN_COLD_START_TEMPLATE).not.toMatch(/research/i);
  });

  it("ask the plan to start with what the agent found in the code", () => {
    expect(after.TASK_TURN_TEMPLATE).toContain(
      "{{#writePlan}}Write the plan: read the code that matters for this task, then write PLAN.md in the repository root. Start with what you found",
    );
    expect(after.TASK_TURN_TEMPLATE).toContain("The plan and the summary of the conversation live in PLAN.md and SUMMARY.md");
    expect(after.TASK_TURN_COLD_START_TEMPLATE).toContain("<current-plan>");
  });
});
