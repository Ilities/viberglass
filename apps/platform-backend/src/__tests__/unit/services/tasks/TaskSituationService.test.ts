import { TaskSituationService, type SituationTask } from "../../../../services/tasks/TaskSituationService";

const at = (time: string) => new Date(`2026-10-01T${time}:00Z`);
const TASK: SituationTask = { id: "t-1", status: "in_review", pullRequestUrl: null, createdAt: at("08:00"), updatedAt: at("12:00") };
const OLLI = { id: "owner", name: "Olli" };
const TOMI = { id: "tomi", name: "Tomi" };
const AGENT = { id: "c-1", name: "Claude" };

function setup() {
  const deps = {
    turns: {
      running: jest.fn().mockResolvedValue(new Map()),
      paused: jest.fn().mockResolvedValue(new Map()),
      lastFinished: jest.fn().mockResolvedValue(new Map()),
      aggregates: jest.fn().mockResolvedValue(new Map()),
    },
    thread: {
      latestRevisions: jest.fn().mockResolvedValue(new Map()),
      lastMessages: jest.fn().mockResolvedValue(new Map()),
      openQuestions: jest.fn().mockResolvedValue(new Map()),
      mergedBy: jest.fn().mockResolvedValue(new Map()),
    },
    mentions: { listOpen: jest.fn().mockResolvedValue(new Map()) },
    participants: { listDrivers: jest.fn().mockResolvedValue(new Map([["t-1", OLLI]])) },
    takeovers: { listFor: jest.fn().mockResolvedValue(new Map()) },
  };
  return { deps, service: new TaskSituationService(deps) };
}

const viewer = (id: string) => ({ id, isAdmin: false });

describe("TaskSituationService", () => {
  it("reads a plan the agent wrote and mentioned Tomi on as his move, with the agent's intent as the last message", async () => {
    const { deps, service } = setup();
    deps.thread.latestRevisions.mockResolvedValue(new Map([["t-1", { phase: "planning", version: 2, at: at("10:00") }]]));
    deps.turns.lastFinished.mockResolvedValue(
      new Map([["t-1", { status: "completed", at: at("10:00"), failure: null, agent: AGENT, intent: "Revising the plan" }]]),
    );
    deps.thread.lastMessages.mockResolvedValue(new Map([["t-1", { author: OLLI, body: "@[Claude](agent:c-1) revise it", at: at("09:00") }]]));
    deps.mentions.listOpen.mockResolvedValue(new Map([["t-1", [{ person: TOMI, at: "2026-10-01T10:00:01.000Z" }]]]));

    const described = (await service.describe([TASK], viewer("tomi"))).get("t-1");

    expect(described?.situation).toMatchObject({ state: "artifact_ready", label: "Plan v2 ready", yourMove: true });
    expect(described?.situation.waitingOn).toEqual({ kind: "people", people: [TOMI] });
    expect(described?.lastMessage).toEqual({ author: AGENT, text: "Revising the plan", at: at("10:00").toISOString() });
    expect(described?.latestActivityAt).toBe(at("10:00").toISOString());
  });

  it("shows a person's message as the last one, with mentions as plain names", async () => {
    const { deps, service } = setup();
    deps.thread.lastMessages.mockResolvedValue(new Map([["t-1", { author: OLLI, body: "@[Tomi](user:11111111-1111-4111-8111-111111111111) can you\nlook?", at: at("09:00") }]]));

    const described = (await service.describe([TASK], viewer("owner"))).get("t-1");

    expect(described?.lastMessage?.text).toBe("@Tomi can you look?");
    expect(described?.situation.state).toBe("discussing");
  });

  it("counts a pull request as the code artifact, newer than the plan", async () => {
    const { deps, service } = setup();
    deps.thread.latestRevisions.mockResolvedValue(new Map([["t-1", { phase: "planning", version: 1, at: at("09:00") }]]));
    deps.turns.aggregates.mockResolvedValue(new Map([["t-1", { codeTurns: 2, lastCodeAt: at("11:00"), lastReplyAt: null }]]));

    const described = (await service.describe([{ ...TASK, pullRequestUrl: "https://github.com/o/r/pull/1" }], viewer("owner"))).get("t-1");

    expect(described?.situation).toMatchObject({ state: "pr_open", yourMove: true });
  });

  it("asks for each fact once for the whole list", async () => {
    const { deps, service } = setup();
    await service.describe([TASK, { ...TASK, id: "t-2" }], viewer("owner"));
    expect(deps.turns.running).toHaveBeenCalledTimes(1);
    expect(deps.turns.running).toHaveBeenCalledWith(["t-1", "t-2"]);
  });
});
