import { withViberglassMark } from "@viberglass/integration-core";
import { TrackerIssueInbound, type TrackerContext, type TrackerIssue } from "../../../../services/trackers/TrackerIssueInbound";
import type { RoutedSpace } from "../../../../services/trackers/TrackerIssueRouter";

const CONTEXT: TrackerContext = { provider: "jira", integrationId: "conn-1", webhookConfigId: "hook-1" };
const ISSUE: TrackerIssue = {
  key: "WEB-12",
  url: "https://acme.atlassian.net/browse/WEB-12",
  apiBaseUrl: "https://acme.atlassian.net",
  title: "Gift notes",
  description: "Let customers add a note.",
  author: { name: "Maria", email: "maria@example.com" },
  severity: "medium",
  labels: ["web"],
  repository: null,
  metadata: { issueType: "Story" },
};

type Linked = Array<{ ticketId: string; projectId: string }>;

function setup(options: { linked?: Linked; routed?: RoutedSpace[]; users?: Record<string, string>; openQuestionFor?: Record<string, string> } = {}) {
  const deps = {
    router: { route: jest.fn().mockResolvedValue({ spaces: options.routed ?? [], reason: "No space takes issues labelled 'web'" }) },
    opener: {
      open: jest.fn().mockImplementation(async (_context: TrackerContext, _issue: TrackerIssue, space: RoutedSpace) => ({
        ticketId: `task-in-${space.projectId}`,
        projectId: space.projectId,
      })),
    },
    tickets: { updateTicket: jest.fn() },
    links: { findTickets: jest.fn().mockResolvedValue(options.linked ?? []) },
    users: {
      findByEmail: jest.fn().mockImplementation(async (email: string) => {
        const id = options.users?.[email];
        return id ? { id, deactivatedAt: null } : null;
      }),
    },
    discussion: { createFromTracker: jest.fn().mockResolvedValue("message-1") },
    questions: {
      listOpenForTasks: jest.fn().mockImplementation(async ([ticketId]: string[]) => {
        const askedOf = options.openQuestionFor?.[ticketId];
        return new Map(askedOf ? [[ticketId, [{ id: `q-${ticketId}`, askedOf: { id: askedOf, name: "Maria" } }]]] : []);
      }),
    },
    answers: { answer: jest.fn().mockResolvedValue({ job: { id: "job-answer" } }) },
    turns: { ask: jest.fn().mockResolvedValue({ job: { id: "job-ask" } }) },
  };
  return { deps, inbound: new TrackerIssueInbound(deps) };
}

describe("TrackerIssueInbound", () => {
  it("opens a task in every space that takes a new issue", async () => {
    const { deps, inbound } = setup({ routed: [{ projectId: "web", plan: true }, { projectId: "api", plan: false }] });

    await expect(inbound.issue(CONTEXT, ISSUE)).resolves.toEqual({ ticketId: "task-in-web", projectId: "web" });

    expect(deps.router.route).toHaveBeenCalledWith(CONTEXT, ISSUE);
    expect(deps.opener.open).toHaveBeenCalledWith(CONTEXT, ISSUE, { projectId: "web", plan: true });
    expect(deps.opener.open).toHaveBeenCalledWith(CONTEXT, ISSUE, { projectId: "api", plan: false });
  });

  it("records why an issue no space takes is ignored", async () => {
    const { deps, inbound } = setup();

    await expect(inbound.issue(CONTEXT, ISSUE)).resolves.toEqual({ ignoredReason: "No space takes issues labelled 'web'" });
    expect(deps.opener.open).not.toHaveBeenCalled();
  });

  it("updates the tasks an edited issue has, and opens one only in a space that takes it now", async () => {
    const { deps, inbound } = setup({
      linked: [{ ticketId: "task-web", projectId: "web" }],
      routed: [{ projectId: "web", plan: false }, { projectId: "api", plan: true }],
    });

    await inbound.issue(CONTEXT, { ...ISSUE, title: " Gift notes v2 ", description: "Now with emoji." });

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-web", { title: "Gift notes v2", description: "Now with emoji." });
    expect(deps.opener.open).toHaveBeenCalledTimes(1);
    expect(deps.opener.open).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ title: "Gift notes v2" }), { projectId: "api", plan: true });
  });

  it("keeps the description when the edit doesn't carry it, and doesn't open a task without a title", async () => {
    const linked = setup({ linked: [{ ticketId: "task-web", projectId: "web" }], routed: [{ projectId: "web", plan: false }] });
    await expect(linked.inbound.issue(CONTEXT, { ...ISSUE, description: undefined })).resolves.toEqual({ ticketId: "task-web", projectId: "web" });
    expect(linked.deps.tickets.updateTicket).toHaveBeenCalledWith("task-web", { title: "Gift notes" });

    const untitled = setup({ routed: [{ projectId: "web", plan: false }] });
    await expect(untitled.inbound.issue(CONTEXT, { ...ISSUE, title: undefined })).resolves.toMatchObject({ ignoredReason: expect.stringContaining("title") });
    expect(untitled.deps.opener.open).not.toHaveBeenCalled();
  });

  it("posts a comment from someone without an account under their name in every linked task, and asks the agent when it mentions the bot", async () => {
    const { deps, inbound } = setup({ linked: [{ ticketId: "task-web", projectId: "web" }, { ticketId: "task-api", projectId: "api" }] });

    const plain = await inbound.commented(CONTEXT, { issueKey: "WEB-12", author: { name: "Pat", email: null }, body: "Looks good", mentionsBot: false });
    expect(plain).toEqual({ ticketId: "task-web", projectId: "web" });
    expect(deps.discussion.createFromTracker).toHaveBeenCalledWith("task-web", { userId: null, name: "Pat", source: "jira" }, "Looks good");
    expect(deps.discussion.createFromTracker).toHaveBeenCalledWith("task-api", { userId: null, name: "Pat", source: "jira" }, "Looks good");
    expect(deps.turns.ask).not.toHaveBeenCalled();

    const ask = await inbound.commented(CONTEXT, { issueKey: "WEB-12", author: { name: "Pat", email: null }, body: "write the plan", mentionsBot: true });
    expect(ask).toEqual({ ticketId: "task-web", projectId: "web", jobId: "job-ask" });
    expect(deps.turns.ask).toHaveBeenCalledWith("task-web", null, { message: "write the plan", postedMessageId: "message-1", fromWebhook: true });
    expect(deps.turns.ask).toHaveBeenCalledWith("task-api", null, { message: "write the plan", postedMessageId: "message-1", fromWebhook: true });
  });

  it("answers the agent's question in the task that asked the person who replies, and posts the reply in the others", async () => {
    const { deps, inbound } = setup({
      linked: [{ ticketId: "task-web", projectId: "web" }, { ticketId: "task-api", projectId: "api" }],
      users: { "maria@example.com": "user-maria" },
      openQuestionFor: { "task-api": "user-maria" },
    });

    const result = await inbound.commented(CONTEXT, { issueKey: "WEB-12", author: { name: "Maria", email: "maria@example.com" }, body: "North", mentionsBot: false });

    expect(result).toEqual({ ticketId: "task-api", projectId: "api", jobId: "job-answer" });
    expect(deps.answers.answer).toHaveBeenCalledWith("task-api", "q-task-api", "user-maria", "North");
    expect(deps.discussion.createFromTracker).toHaveBeenCalledTimes(1);
    expect(deps.discussion.createFromTracker).toHaveBeenCalledWith("task-web", { userId: "user-maria", name: "Maria", source: "jira" }, "North");
  });

  it("ignores its own comments and comments on issues with no task", async () => {
    const own = setup({ linked: [{ ticketId: "task-web", projectId: "web" }] });
    await expect(
      own.inbound.commented(CONTEXT, { issueKey: "WEB-12", author: { name: "Viberglass", email: null }, body: withViberglassMark("**Done.**"), mentionsBot: false }),
    ).resolves.toEqual({ ignoredReason: "Posted by Viberglass" });

    const unlinked = setup();
    await expect(
      unlinked.inbound.commented(CONTEXT, { issueKey: "WEB-99", author: { name: "Pat", email: null }, body: "hi", mentionsBot: false }),
    ).resolves.toMatchObject({ ignoredReason: expect.stringContaining("No task is linked") });
    expect(own.deps.discussion.createFromTracker).not.toHaveBeenCalled();
  });
});
