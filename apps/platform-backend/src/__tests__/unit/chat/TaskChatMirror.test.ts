import { askValue, parseAskValue } from "@viberglass/integration-core";
import type { TaskActivityKind, TaskPlanParts } from "@viberglass/types";
import type { RecordedActivity } from "../../../services/notifications/NotificationService";
import type { AgentQuestionRecord } from "../../../persistence/agentSession/AgentQuestionDAO";
import { TaskChatMirror } from "../../../chat/TaskChatMirror";
import { TaskTurnChatPosts } from "../../../chat/TaskTurnChatPosts";

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
  addable: null,
  next: 2,
};

const FILES_TURN = {
  intent: "Making the deck",
  reply: "Making the deck\n\nDone.",
  produced: [],
  files: { id: "s2", parentId: "s1", fileCount: 3, totalBytes: 10, partial: false, changes: { added: 1, changed: 0, removed: 0 }, createdAt: "" },
  artifacts: [{ artifactId: "art-1", versionId: "ver-2", title: "Q4 deck", number: 2, format: "html" }],
  codeDiscarded: false,
  resumed: null,
};

function setup(options: { fromChat?: boolean; thread?: boolean; parts?: TaskPlanParts; backingKind?: "git" | "files" } = {}) {
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
    tickets: {
      getSummary: jest.fn().mockResolvedValue({ title: "Greeting", key: "WEB-1", spaceSlug: "web", backingKind: options.backingKind ?? "git", pullRequestUrl: null }),
    },
    parts: { state: jest.fn().mockResolvedValue(options.parts ?? { parts: [], open: null, addable: null, next: null }) },
    artifacts: { listForTicket: jest.fn().mockResolvedValue([]) },
    fromChat: () => options.fromChat ?? false,
  };
  const turnPosts = new TaskTurnChatPosts(deps);
  return { thread, deps, mirror: new TaskChatMirror({ ...deps, turnPosts }) };
}

const activity = (kind: TaskActivityKind, payload: Record<string, unknown> = {}): RecordedActivity => ({ ticketId: "t-1", kind, actorId: null, payload });
const posted = (thread: { post: jest.Mock }) => thread.post.mock.calls.map(([post]) => JSON.stringify(post));

describe("TaskChatMirror", () => {
  const frontendUrl = process.env.PLATFORM_FRONTEND_URL;
  beforeAll(() => {
    process.env.PLATFORM_FRONTEND_URL = "https://vg.example";
  });
  afterAll(() => {
    process.env.PLATFORM_FRONTEND_URL = frontendUrl;
  });

  it("posts a message written in Viberglass, with mentions as names", async () => {
    const { thread, mirror } = setup();
    await mirror.onActivity(activity("message_posted", { messageId: "m-1" }));
    expect(thread.post).toHaveBeenCalledWith({ markdown: "**Tomi:** Hi @Maria" });
  });

  it("doesn't echo what came from chat, or post for tasks without a thread", async () => {
    const fromChat = setup({ fromChat: true });
    await fromChat.mirror.onActivity(activity("message_posted", { messageId: "m-1" }));
    await fromChat.mirror.onActivity(activity("question_answered", { questionId: "q-1" }));
    expect(fromChat.thread.post).not.toHaveBeenCalled();

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
    expect(card).toContain('"t-1|code|1-"');
    expect(card).not.toContain("Mark done");
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
    deps.turns.getByJobId.mockResolvedValue({ ...(await deps.turns.getByJobId("job-1")), action: "code" });
    await mirror.onActivity(activity("question_answered", { questionId: "q-1" }));
    await mirror.onActivity(activity("run_started", { step: "planning", action: "plan" }));
    await mirror.onActivity(activity("run_failed", { jobId: "job-1", step: "execution", reason: "GitHub connection expired" }));
    await mirror.onActivity(activity("run_started", { step: "execution" }));
    expect(thread.post.mock.calls.map(([post]) => post)).toEqual([
      { markdown: "_Maria answered Claude: North_" },
      { markdown: "_The agent is writing the plan…_" },
      { markdown: "**The build run failed**: GitHub connection expired" },
      { markdown: "_The agent is working…_" },
    ]);
  });

  it("calls a Files space's code run the artifact's, whatever its job kind", async () => {
    const { thread, deps, mirror } = setup({ backingKind: "files" });
    deps.turns.getByJobId.mockResolvedValue({ ...(await deps.turns.getByJobId("job-1")), action: "code" });
    await mirror.onActivity(activity("run_started", { step: "reply", action: "code" }));
    await mirror.onActivity(activity("run_failed", { jobId: "job-1", step: "reply", reason: "Out of time" }));
    expect(thread.post.mock.calls.map(([post]) => post)).toEqual([
      { markdown: "_The agent is working on the artifact…_" },
      { markdown: "**The artifact run failed**: Out of time" },
    ]);
  });

  it("offers the artifact, not a build, after a plan in a Files space, and marking the task done", async () => {
    const parts: TaskPlanParts = { ...TWO_PARTS, parts: TWO_PARTS.parts.map((part) => ({ ...part, status: "not_built", pullRequestUrl: null })), next: 1 };
    const { thread, mirror } = setup({ backingKind: "files", parts });
    await mirror.onActivity(activity("run_finished", { jobId: "job-1", step: "planning" }));

    const card = posted(thread)[2];
    expect(card).toContain("Create artifact");
    expect(card).toContain('"t-1|code"');
    expect(card).not.toContain("Build");
    expect(card).toContain("task_mark_done");
  });

  it("posts what a Files turn saved, links its artifact and offers to revise it", async () => {
    const { thread, deps, mirror } = setup({ backingKind: "files" });
    deps.turns.getByJobId.mockResolvedValue({ ...(await deps.turns.getByJobId("job-1")), action: "code", outcome: FILES_TURN });
    await mirror.onActivity(activity("run_finished", { jobId: "job-1", step: "reply" }));

    const posts = posted(thread);
    expect(posts[1]).toBe(JSON.stringify({ markdown: "_Saved files · 1 added · 3 files_" }));
    expect(posts[2]).toBe(JSON.stringify({ markdown: "**Artifact:** [Q4 deck](https://vg.example/spaces/web/artifacts/art-1?version=ver-2) v2" }));
    expect(posts[3]).toContain("Revise artifact");
    expect(posts[3]).toContain("Mark done");
    expect(posts[3]).toContain('"value":"t-1"');
    expect(deps.artifacts.listForTicket).not.toHaveBeenCalled();
  });

  it("offers to revise the task's artifact after a plan once there is one", async () => {
    const { thread, deps, mirror } = setup({ backingKind: "files" });
    deps.artifacts.listForTicket.mockResolvedValue([{ id: "art-1", title: "Q4 deck", entrypoint: "index.html" }]);
    await mirror.onActivity(activity("run_finished", { jobId: "job-1", step: "planning" }));
    expect(posted(thread)[2]).toContain("Revise artifact");
  });
});
