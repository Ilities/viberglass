import { planParts } from "@viberglass/types";
import * as before from "../../../migrations/103_plan_includes_research";
import * as after from "../../../migrations/104_plan_in_parts";

// The migration edits stored templates with SQL replace(), which changes nothing
// when a string isn't found; the same edits made here show each one matched.
describe("the turn templates once plans are written in parts", () => {
  it("ask for the plan in parts, each one pull request", () => {
    expect(before.TASK_TURN_TEMPLATE).not.toContain("## Part 1");
    expect(after.TASK_TURN_TEMPLATE).toContain("each part is a `## Part 1: <title>` section");
    expect(after.TASK_TURN_TEMPLATE).toContain("small enough to review as one pull request");
  });

  it("keep the parts' numbers when the plan is revised", () => {
    expect(after.TASK_TURN_TEMPLATE).toContain("Keep each part's number: don't renumber or merge parts");
  });

  it("leave the cold start as it was", () => {
    expect(after.TASK_TURN_COLD_START_TEMPLATE).toBe(before.TASK_TURN_COLD_START_TEMPLATE);
  });

  it("describe parts the parser reads", () => {
    const plan = "# Plan\n\n## Part 1: <title>\nDo it.\n";
    expect(planParts(plan)).toEqual([{ number: 1, title: "<title>", body: "Do it." }]);
  });
});
