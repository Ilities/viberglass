import { buildPartsMessage, isPartRange, nextBuild, partRangeName, type TaskPlanParts } from "@viberglass/types";

const part = (number: number, status: TaskPlanParts["parts"][number]["status"]) => ({ number, title: null, status, pullRequestUrl: null });

describe("part ranges", () => {
  it("names a range of the plan's parts", () => {
    expect(partRangeName({ first: 1, last: null })).toBe("the plan");
    expect(partRangeName({ first: 2, last: null })).toBe("parts 2 to the end");
    expect(partRangeName({ first: 2, last: 2 })).toBe("part 2");
    expect(partRangeName({ first: 2, last: 3 })).toBe("parts 2–3");
  });

  it("words the ask for a build of them", () => {
    expect(buildPartsMessage({ first: 1, last: null })).toBe("Build it");
    expect(buildPartsMessage({ first: 2, last: null })).toBe("Build the rest");
    expect(buildPartsMessage({ first: 2, last: 2 })).toBe("Build part 2");
    expect(buildPartsMessage({ first: 2, last: 3 })).toBe("Build parts 2–3");
  });

  it("checks a range from a request", () => {
    expect(isPartRange({ first: 1, last: null })).toBe(true);
    expect(isPartRange({ first: 2, last: 3 })).toBe(true);
    for (const value of [null, {}, { first: 0, last: null }, { first: 2, last: 1 }, { first: 1.5, last: null }, { first: "1", last: null }, { first: 1 }]) {
      expect(isPartRange(value)).toBe(false);
    }
  });
});

describe("nextBuild", () => {
  it("offers the whole plan for a plan in one part, or none, even with its pull request open", () => {
    expect(nextBuild({ parts: [], open: null, addable: null, next: null })).toEqual({ label: "Build it" });
    expect(nextBuild({ parts: [part(1, "open")], open: { first: 1, last: null }, addable: null, next: null })).toEqual({ label: "Build it" });
  });

  it("offers the next part on its own", () => {
    expect(nextBuild({ parts: [part(1, "merged"), part(2, "not_built")], open: null, addable: null, next: 2 })).toEqual({
      label: "Build part 2",
      parts: { first: 2, last: 2 },
    });
  });

  it("offers nothing while a part's pull request is open, or once every part is built", () => {
    expect(nextBuild({ parts: [part(1, "open"), part(2, "not_built")], open: { first: 1, last: 1 }, addable: null, next: null })).toBeNull();
    expect(nextBuild({ parts: [part(1, "merged"), part(2, "merged")], open: null, addable: null, next: null })).toBeNull();
  });
});
