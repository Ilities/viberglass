import { askValue, parseAskValue } from "@viberglass/chat-slack";
import type { TaskActivityKind, TaskPlanParts } from "@viberglass/types";
import type { RecordedActivity } from "../../../services/notifications/NotificationService";
import type { AgentQuestionRecord } from "../../../persistence/agentSession/AgentQuestionDAO";
import { TaskSlackMirror } from "../../../chat/TaskSlackMirror";

// "chat" is ESM-only and doesn't resolve under Jest; cards become plain objects to read.
jest.mock(
  "chat",
  () => ({
    Card: (props: unknown) => ({ card: props }),
    CardText: (text: string) => ({ text }),
    Actions: (buttons: unknown[]) => ({ actions: buttons }),
    Button: (props: unknown) => ({ button: props }),
    ThreadImpl: jest.fn(),
  }),
  { virtual: true },
);

function question(overrides: Partial<AgentQuestionRecord> = {}): AgentQuestionRecord {
  return {
    id: "q-1",
    ticketId: "t-1",
    sessionId: "s-1",
    turnId: "turn-1",
    agent: { id: "claude", name: "Claude" },
    askedOf: { id: "u-maria", name: "Maria" },
    question: "Which warehouse?",
    options: ["North", "South"],
    blocking: true,
    status: "open",
    askedAt: "2026-10-02T09:00:00.000Z",
    answer: null,
    dueAt: null,
    remindedAt: null,
    ...overrides,
  };
}

const TWO_PARTS: TaskPlanParts = {
  parts: [
    { number: 1, title: "Store it", status: "merged", pullRequestUrl: "https://github.com/acme/app/pull/7" },
    { number: 2, title: "Show it", status: "not_built", pullRequestUrl: null },
  ],
  open: null,
  next: 2,
};

function setup(options: { fromSlack?: boolean; thread?: boolean; parts?: TaskPlanParts } = {}) {
  const thread = { post: jest.fn().mockResolvedValue(undefined) };
  const deps = {
    threads: { forTask: jest.fn().mockResolvedValue(options.thread === false ? undefined : thread) },
    turns: {
      getByJobId: jest.fn().mockResolvedValue({
        id: "turn-1",
        sessionId: "s-1",
        agent: { id: "claude", name: "Claude" },
        action: "plan",
        status: "completed",
        outcome: { intent: "Writing the plan", reply: "Writing the plan\n\nDone.", produced: ["plan"], codeDiscarded: false, resumed: true },
        jobId: "job-1",
        createdAt: new Date(),
      }),
    },
    questions: { getById: jest.fn().mockResolvedValue(question()) },
    messages: {
      getById: jest.fn().mockResolvedValue({ id: "m-1", ticketId: "t-1", author: { id: "u-tomi", name: "Tomi" }, body: "Hi @[Maria](user:11111111-1111-4111-8111-111111111111)", createdAt: "", editedAt: null }),
    },
    documents: { getOrCreateDocument: jest.fn().mockResolvedValue({ content: "# Plan\nIt greets." }) },
    tickets: { getSummary: jest.fn().mockResolvedValue({ title: "Greeting", key: "WEB-1", spaceSlug: "web", pullRequestUrl: null }) },
    parts: { state: jest.fn().mockResolvedValue(options.parts ?? { parts: [], open: null, next: null }) },
    fromSlack: () => options.fromSlack ?? false,
  };
  return { thread, deps, mirror: new TaskSlackMirror(deps) };
}

const activity = (kind: TaskActivityKind, payload: Record<string, unknown> = {}): RecordedActivity => ({ ticketId: "t-1", kind, actorId: null, payload });
const posted = (thread: { post: jest.Mock }) => thread.post.mock.calls.map(([post]) => JSON.stringify(post));

describe("TaskSlackMirror", () => {
  it("posts a message written in Viberglass, with mentions as names", async () => {
    const { thread, mirror } = setup();
    await mirror.onActivity(activity("message_posted", { messageId: "m-1" }));
    expect(thread.post).toHaveBeenCalledWith({ markdown: "**Tomi:** Hi @Maria" });
  });

  it("doesn't echo what came from Slack, or post for tasks without a thread", async () => {
    const fromSlack = setup({ fromSlack: true });
    await fromSlack.mirror.onActivity(activity("message_posted", { messageId: "m-1" }));
    await fromSlack.mirror.onActivity(activity("question_answered", { questionId: "q-1" }));
    expect(fromSlack.thread.post).not.toHaveBeenCalled();

    const noThread = setup({ thread: false });
    await noThread.mirror.onActivity(activity("run_started", { step: "planning" }));
    expect(noThread.deps.turns.getByJobId).not.toHaveBeenCalled();
  });

  it("posts the agent's reply, the document it wrote, and a button for the next step", async () => {
    const { thread, mirror } = setup();
    await mirror.onActivity(activity("run_finished", { jobId: "job-1", step: "planning" }));

    const posts = posted(thread);
    expect(posts[0]).toBe(JSON.stringify({ markdown: "**Claude:** Writing the plan\n\nDone." }));
    expect(posts[1]).toContain("plan.md");
    expect(posts[2]).toContain("Build it");
    expect(posts[2]).toContain('"t-1|code"');
  });

  it("offers the plan's first part after a plan in parts", async () => {
    const parts: TaskPlanParts = { ...TWO_PARTS, parts: TWO_PARTS.parts.map((part) => ({ ...part, status: "not_built", pullRequestUrl: null })), next: 1 };
    const { thread, mirror } = setup({ parts });
    await mirror.onActivity(activity("run_finished", { jobId: "job-1", step: "planning" }));

    const card = posted(thread)[2];
    expect(card).toContain("Build part 1");
    expect(card).toContain('"t-1|code|1-1"');
  });

  it("says a part merged and offers the next, without closing anything", async () => {
    const { thread, mirror } = setup({ parts: TWO_PARTS });
    await mirror.onActivity(activity("part_merged", { pullRequestUrl: "https://github.com/acme/app/pull/7", parts: [1], next: 2, mergedBy: "dev" }));

    const posts = posted(thread);
    expect(posts[0]).toBe(JSON.stringify({ markdown: "**Part 1 is merged** by dev." }));
    expect(posts[1]).toContain("Build part 2");
    expect(posts[1]).toContain('"t-1|code|2-2"');
    expect(posts.join("")).not.toContain("Done.");
  });

  it("reads back the parts an ask button builds", () => {
    expect(parseAskValue(askValue("t-1", "code", { first: 2, last: 2 }))).toEqual({ ticketId: "t-1", action: "code", parts: { first: 2, last: 2 } });
    expect(parseAskValue(askValue("t-1", "code", { first: 2, last: null }))).toEqual({ ticketId: "t-1", action: "code", parts: { first: 2, last: null } });
    expect(parseAskValue(askValue("t-1", "plan"))).toEqual({ ticketId: "t-1", action: "plan" });
    expect(parseAskValue("t-1|nonsense")).toBeNull();
    expect(parseAskValue("t-1|code|x-y")).toBeNull();
  });

  it("asks the agent's question with its options as buttons", async () => {
    const { thread, mirror } = setup();
    await mirror.onActivity(activity("question_asked", { questionId: "q-1" }));
    const [card] = posted(thread);
    expect(card).toContain("Claude asks Maria");
    expect(card).toContain("Which warehouse?");
    expect(card).toContain("question_answer_1");
    expect(card).toContain('"q-1|1"');
  });

  it("says who answered on the web, and that a run started or failed", async () => {
    const { thread, deps, mirror } = setup();
    deps.questions.getById.mockResolvedValue(question({ status: "answered", answer: { by: { id: "u-maria", name: "Maria" }, text: "North", at: "" } }));
    await mirror.onActivity(activity("question_answered", { questionId: "q-1" }));
    await mirror.onActivity(activity("run_started", { step: "planning" }));
    await mirror.onActivity(activity("run_failed", { step: "execution", reason: "GitHub connection expired" }));
    expect(thread.post.mock.calls.map(([post]) => post)).toEqual([
      { markdown: "_Maria answered Claude: North_" },
      { markdown: "_The agent is writing the plan…_" },
      { markdown: "**The build run failed**: GitHub connection expired" },
    ]);
  });
});
