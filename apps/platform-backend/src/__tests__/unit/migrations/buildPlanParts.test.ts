import * as before from "../../../migrations/104_plan_in_parts";
import * as after from "../../../migrations/107_build_plan_parts";

// The migration edits stored templates with SQL replace(), which changes nothing
// when a string isn't found; the same edits made here show each one matched.
describe("the turn templates once builds cover parts of the plan", () => {
  it("say which parts a build covers, right after asking for the build", () => {
    expect(before.TASK_TURN_TEMPLATE).not.toContain("{{#buildParts}}");
    expect(after.TASK_TURN_TEMPLATE).toContain("{{/buildIt}}{{#buildParts}}This build is {{buildParts}} of the plan, in a pull request of its own");
  });

  it("say which parts are built, right after asking for a revision", () => {
    expect(after.TASK_TURN_TEMPLATE).toContain("{{/revisePlan}}{{#builtParts}}Built already, each in a pull request: {{builtParts}}.");
  });

  it("leave the cold start as it was", () => {
    expect(after.TASK_TURN_COLD_START_TEMPLATE).toBe(before.TASK_TURN_COLD_START_TEMPLATE);
  });
});
