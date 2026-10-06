import type { TaskPlanParts } from "@viberglass/types";
import { describeTurnParts } from "../../../../services/taskTurns/describeTurnParts";

const state: TaskPlanParts = {
  parts: [
    { number: 1, title: "Store it", status: "merged", pullRequestUrl: "u1" },
    { number: 2, title: "Show it", status: "not_built", pullRequestUrl: null },
    { number: 3, title: null, status: "not_built", pullRequestUrl: null },
  ],
  open: null,
  next: 2,
};

describe("describeTurnParts", () => {
  it("names the part a build covers, with its title", () => {
    expect(describeTurnParts(state, { first: 2, last: 2 }).building).toBe("part 2, “Show it”");
    expect(describeTurnParts(state, { first: 3, last: 3 }).building).toBe("part 3");
    expect(describeTurnParts(state, { first: 2, last: null }).building).toBe("parts 2 to the end");
  });

  it("names the parts that already have pull requests", () => {
    expect(describeTurnParts(state, null)).toEqual({ building: null, built: "Part 1" });
    const two: TaskPlanParts = { ...state, parts: state.parts.map((part) => (part.number < 3 ? { ...part, status: "merged" } : part)) };
    expect(describeTurnParts(two, null).built).toBe("Parts 1 and 2");
  });

  it("says nothing of parts for a plan in one part", () => {
    const single: TaskPlanParts = { parts: [{ number: 1, title: null, status: "open", pullRequestUrl: "u1" }], open: { first: 1, last: null }, next: null };
    expect(describeTurnParts(single, { first: 1, last: null })).toEqual({ building: null, built: null });
  });
});
