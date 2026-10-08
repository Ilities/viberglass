import type { TaskPlanParts } from "@viberglass/types";
import { describeTurnParts } from "../../../../services/taskTurns/describeTurnParts";

const state: TaskPlanParts = {
  parts: [
    { number: 1, title: "Store it", status: "merged", pullRequestUrl: "u1" },
    { number: 2, title: "Show it", status: "not_built", pullRequestUrl: null },
    { number: 3, title: null, status: "not_built", pullRequestUrl: null },
  ],
  open: null,
  addable: null,
  next: 2,
};

describe("describeTurnParts", () => {
  it("names the part a build covers, with its title", () => {
    expect(describeTurnParts(state, { first: 2, last: 2 }).building).toBe("part 2, “Show it”");
    expect(describeTurnParts(state, { first: 3, last: 3 }).building).toBe("part 3");
    expect(describeTurnParts(state, { first: 2, last: null }).building).toBe("parts 2 to the end");
  });

  it("names the parts that already have pull requests", () => {
    expect(describeTurnParts(state, null)).toEqual({ building: null, adding: null, addedTo: null, built: "Part 1" });
    const two: TaskPlanParts = { ...state, parts: state.parts.map((part) => (part.number < 3 ? { ...part, status: "merged" } : part)) };
    expect(describeTurnParts(two, null).built).toBe("Parts 1 and 2");
  });

  it("names the parts a build adds to the open pull request, and those it builds already", () => {
    const open: TaskPlanParts = {
      ...state,
      parts: state.parts.map((part) => (part.number === 2 ? { ...part, status: "open", pullRequestUrl: "u2" } : part)),
      open: { first: 2, last: 3 },
      next: null,
    };
    expect(describeTurnParts(open, { first: 3, last: 3 })).toMatchObject({ building: null, adding: "part 3", addedTo: "part 2" });
    expect(describeTurnParts(open, null)).toMatchObject({ building: null, adding: null });
  });

  it("leaves skipped parts out of those built", () => {
    const skipped: TaskPlanParts = { ...state, parts: state.parts.map((part) => (part.number === 2 ? { ...part, status: "skipped" } : part)) };
    expect(describeTurnParts(skipped, null).built).toBe("Part 1");
  });

  it("says nothing of parts for a plan in one part", () => {
    const single: TaskPlanParts = { parts: [{ number: 1, title: null, status: "open", pullRequestUrl: "u1" }], open: { first: 1, last: null }, addable: null, next: null };
    expect(describeTurnParts(single, { first: 1, last: null })).toEqual({ building: null, adding: null, addedTo: null, built: null });
  });
});
