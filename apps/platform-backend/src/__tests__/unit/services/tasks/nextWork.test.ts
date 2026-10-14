import { buildWork, nextWork, turnRunLabel, type PartRange, type TaskPlanParts, type TaskPlanPartStatus } from "@viberglass/types";

const part = (number: number, status: TaskPlanPartStatus) => ({ number, title: `Part ${number}`, status, pullRequestUrl: null });
const plan = (statuses: TaskPlanPartStatus[], open: PartRange | null = null): TaskPlanParts => {
  const parts = statuses.map((status, index) => part(index + 1, status));
  return { parts, open, addable: null, next: open ? null : (parts.find((entry) => entry.status === "not_built")?.number ?? null) };
};

describe("nextWork", () => {
  it("offers a Files task's artifact, to create or to revise, whatever the plan", () => {
    expect(nextWork("files", { planParts: plan(["not_built", "not_built"]), hasArtifacts: false })).toEqual([{ action: "code", label: "Create artifact" }]);
    expect(nextWork("files", { planParts: null, hasArtifacts: true })).toEqual([{ action: "code", label: "Revise artifact" }]);
  });

  it("offers a Git task's builds", () => {
    expect(nextWork("git", { planParts: plan(["not_built", "not_built"]), hasArtifacts: true }).map((offer) => offer.label)).toEqual(["Build part 1", "Build it"]);
  });
});

describe("buildWork", () => {
  it("builds a plan in one part, or none, as a whole", () => {
    expect(buildWork(null)).toEqual([{ action: "code", label: "Build it" }]);
    expect(buildWork(plan(["not_built"]))).toEqual([{ action: "code", label: "Build it" }]);
  });

  it("offers the first part on its own, or the whole plan in one pull request", () => {
    expect(buildWork(plan(["not_built", "not_built", "not_built"]))).toEqual([
      { action: "code", label: "Build part 1", parts: { first: 1, last: 1 } },
      { action: "code", label: "Build it", parts: { first: 1, last: null } },
    ]);
  });

  it("offers the next part, or the rest, once the earlier parts are merged", () => {
    expect(buildWork(plan(["merged", "not_built", "not_built"])).map((offer) => offer.label)).toEqual(["Build part 2", "Build the rest"]);
    expect(buildWork(plan(["merged", "merged", "not_built"])).map((offer) => offer.label)).toEqual(["Build part 3"]);
  });

  it("offers no new part while a part's pull request is open, or once every part is built", () => {
    expect(buildWork(plan(["open", "not_built"], { first: 1, last: 1 }))).toEqual([]);
    expect(buildWork(plan(["merged", "merged"]))).toEqual([]);
  });

  it("offers a build that never opened its pull request again, without the rest", () => {
    expect(buildWork(plan(["merged", "building", "not_built", "not_built"], { first: 2, last: 2 }))).toEqual([
      { action: "code", label: "Build part 2 again", parts: { first: 2, last: 2 } },
    ]);
  });
});

describe("turnRunLabel", () => {
  it("calls a Files space's code run the artifact's, and the rest by what was asked", () => {
    expect(turnRunLabel("code", "files")).toEqual({ doing: "working on the artifact", run: "artifact" });
    expect(turnRunLabel("code", "git")).toEqual({ doing: "building", run: "build" });
    expect(turnRunLabel("plan", "files")).toEqual({ doing: "writing the plan", run: "plan" });
    expect(turnRunLabel("reply", "git")).toEqual({ doing: "replying", run: "reply" });
  });
});
