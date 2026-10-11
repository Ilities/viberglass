import * as before from "../../../migrations/107_build_plan_parts";
import * as after from "../../../migrations/112_intent_in_plain_words";

describe("the turn template once the first line is in plain words", () => {
  it("asks for the first line without file names", () => {
    expect(before.TASK_TURN_TEMPLATE).not.toContain("not file names like PLAN.md");
    expect(after.TASK_TURN_TEMPLATE).toContain('"the plan", not file names like PLAN.md');
  });
});
