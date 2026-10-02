import { situationPhrase, taskSituation, type TaskSituationInput } from "@viberglass/types";

const OWNER = { id: "owner", name: "Olli" };
const TOMI = { id: "tomi", name: "Tomi" };
const MARIA = { id: "maria", name: "Maria" };

const base: TaskSituationInput = {
  status: "open",
  createdAt: "2026-10-01T08:00:00Z",
  owner: OWNER,
  latestArtifact: null,
  runningTurn: null,
  lastTurn: null,
  openQuestion: null,
  openMentions: [],
  lastMessageAt: null,
};

const PLAN_V2 = { kind: "plan" as const, version: 2, at: "2026-10-01T10:00:00Z" };
const as = (id: string, isAdmin = false) => ({ id, isAdmin });
const situation = (input: Partial<TaskSituationInput>, viewer = as("owner")) => taskSituation({ ...base, ...input }, viewer);

describe("taskSituation", () => {
  it.each([
    ["a new task", {}, "not_started", "Not started · Olli"],
    ["the agent writing the research", { runningTurn: { action: "research" as const, since: "t" } }, "agent_working", "Agent writing the research"],
    ["the agent revising the plan it wrote", { latestArtifact: PLAN_V2, runningTurn: { action: "plan" as const, since: "t" } }, "agent_working", "Agent revising the plan"],
    ["a plan nobody was mentioned on", { latestArtifact: PLAN_V2 }, "artifact_ready", "Plan v2 ready · Olli"],
    ["a plan the agent mentioned Tomi on", { latestArtifact: PLAN_V2, openMentions: [{ person: TOMI, at: PLAN_V2.at }] }, "artifact_ready", "Plan v2 ready · Tomi"],
    ["people talking since the plan", { latestArtifact: PLAN_V2, lastMessageAt: "2026-10-01T11:00:00Z", openMentions: [{ person: MARIA, at: "2026-10-01T11:00:00Z" }] }, "discussing", "Discussing · Maria"],
    ["an agent question", { openQuestion: { askedOf: [MARIA], since: "t" } }, "question", "Question for Maria"],
    ["the agent paused, with a question open", { pausedSince: "t", openQuestion: { askedOf: [MARIA], since: "t" } }, "paused", "Agent paused · Olli"],
    ["work taken over by Tomi", { pausedSince: "t", takenOver: { by: TOMI, at: "t" } }, "paused", "Taken over locally · Tomi"],
    [
      "the agent paused by a setup failure",
      { pausedSince: "t", lastTurn: { status: "failed" as const, at: "t", failure: { title: "Repository not reachable", category: "setup" as const } } },
      "paused",
      "Paused · Repository not reachable · Olli",
    ],
    [
      "a failed turn",
      { lastTurn: { status: "failed" as const, at: "2026-10-01T09:00:00Z", failure: { title: "Credential expired", category: "setup" as const } } },
      "failed",
      "Failed · Credential expired · Olli",
    ],
    ["a pull request", { latestArtifact: { kind: "code" as const, version: 1, at: "2026-10-01T12:00:00Z" } }, "pr_open", "PR open · Olli"],
    ["a done task", { status: "resolved" as const, latestArtifact: PLAN_V2 }, "done", "Done"],
    ["a task its merge closed", { status: "resolved" as const, mergedBy: "dev-koskinen" }, "done", "Done · merged by dev-koskinen"],
  ])("%s", (_name, input, state, phrase) => {
    const result = situation(input);
    expect(result.state).toBe(state);
    expect(situationPhrase(result)).toBe(phrase);
  });

  it("is your move only when it waits on you", () => {
    const ready = { latestArtifact: PLAN_V2, openMentions: [{ person: TOMI, at: PLAN_V2.at }] };
    expect(situation(ready, as("tomi")).yourMove).toBe(true);
    expect(situation(ready, as("owner")).yourMove).toBe(false);
    expect(situation({ runningTurn: { action: "plan", since: "t" } }, as("owner")).yourMove).toBe(false);
    expect(situation({ status: "resolved" }, as("owner")).yourMove).toBe(false);
  });

  it("puts the agent paused by a setup failure on admins too, since they fix it", () => {
    const input = { pausedSince: "t", lastTurn: { status: "failed" as const, at: "t", failure: { title: "Credential expired", category: "setup" as const } } };
    expect(situation(input, as("someone-else", true)).yourMove).toBe(true);
    expect(situation(input, as("someone-else")).yourMove).toBe(false);
  });

  it("puts a setup failure on admins as well as the owner", () => {
    const failed = { lastTurn: { status: "failed" as const, at: "2026-10-01T09:00:00Z", failure: { category: "setup" as const } } };
    expect(situation(failed, as("admin", true)).yourMove).toBe(true);
    const agentFailure = { lastTurn: { status: "failed" as const, at: "2026-10-01T09:00:00Z", failure: { category: "agent" as const } } };
    expect(situation(agentFailure, as("admin", true)).yourMove).toBe(false);
  });

  it("stops showing a failure once someone has written since", () => {
    const result = situation({
      lastTurn: { status: "failed", at: "2026-10-01T09:00:00Z", failure: null },
      lastMessageAt: "2026-10-01T09:30:00Z",
    });
    expect(result.state).toBe("discussing");
  });

  it("leaves out mentions made before the latest artifact when it's ready", () => {
    const result = situation({ latestArtifact: PLAN_V2, openMentions: [{ person: MARIA, at: "2026-10-01T09:00:00Z" }] });
    expect(result.waitingOn).toEqual({ kind: "people", people: [OWNER] });
  });

  it("names each person once, and waits on nobody without an owner", () => {
    const twice = situation({ lastMessageAt: "t2", openMentions: [{ person: TOMI, at: "t1" }, { person: TOMI, at: "t2" }, { person: MARIA, at: "t2" }] });
    expect(situationPhrase(twice)).toBe("Discussing · Tomi and Maria");
    expect(situation({ owner: null }).waitingOn).toEqual({ kind: "nobody" });
  });
});
