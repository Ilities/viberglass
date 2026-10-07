import { withViberglassMark } from "@viberglass/integration-core";
import { TrackerIssueInbound, type OpenedIssue, type TrackerContext } from "../../../../services/trackers/TrackerIssueInbound";

const CONTEXT: TrackerContext = { provider: "jira", projectId: "space-1", integrationId: "conn-1", webhookConfigId: "hook-1" };
const ISSUE: OpenedIssue = {
  key: "WEB-12",
  url: "https://acme.atlassian.net/browse/WEB-12",
  apiBaseUrl: "https://acme.atlassian.net",
  title: "Gift notes",
  description: "Let customers add a note.",
  author: { name: "Maria", email: "maria@example.com" },
  severity: "medium",
  plan: false,
  metadata: { issueType: "Story" },
};

function setup(options: { linked?: string | null; users?: Record<string, string>; openQuestionFor?: string } = {}) {
  const deps = {
    tickets: { createTicket: jest.fn().mockResolvedValue({ id: "task-1" }), updateTicket: jest.fn() },
    links: { create: jest.fn(), findTicket: jest.fn().mockResolvedValue(options.linked ?? null) },
    users: {
      findByEmail: jest.fn().mockImplementation(async (email: string) => {
        const id = options.users?.[email];
        return id ? { id, deactivatedAt: null } : null;
      }),
    },
    discussion: { createFromTracker: jest.fn().mockResolvedValue("message-1") },
    questions: {
      listOpenForTasks: jest.fn().mockResolvedValue(
        new Map(options.openQuestionFor ? [["task-1", [{ id: "q-1", askedOf: { id: options.openQuestionFor, name: "Maria" } }]]] : []),
      ),
    },
    answers: { answer: jest.fn().mockResolvedValue({ job: { id: "job-answer" } }) },
    turns: { ask: jest.fn().mockResolvedValue({ job: { id: "job-ask" } }) },
    planner: { request: jest.fn().mockResolvedValue("job-plan") },
  };
  return { deps, inbound: new TrackerIssueInbound(deps) };
}

describe("TrackerIssueInbound", () => {
  it("creates the task for a new issue, linked to it, with the matching person as requester", async () => {
    const { deps, inbound } = setup({ users: { "maria@example.com": "user-maria" } });

    await expect(inbound.opened(CONTEXT, ISSUE)).resolves.toEqual({ ticketId: "task-1" });

    expect(deps.tickets.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "space-1", title: "Gift notes", ticketSystem: "jira", requesterId: "user-maria" }),
    );
    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-1", { externalTicketId: "WEB-12", externalTicketUrl: ISSUE.url });
    expect(deps.links.create).toHaveBeenCalledWith({
      ticketId: "task-1",
      provider: "jira",
      issueKey: "WEB-12",
      issueUrl: ISSUE.url,
      integrationId: "conn-1",
      webhookConfigId: "hook-1",
      apiBaseUrl: "https://acme.atlassian.net",
    });
    expect(deps.planner.request).not.toHaveBeenCalled();
  });

  it("asks for the plan when the connection plans new issues, and doesn't create a second task for the same issue", async () => {
    const fresh = setup();
    await expect(fresh.inbound.opened(CONTEXT, { ...ISSUE, plan: true })).resolves.toEqual({ ticketId: "task-1", jobId: "job-plan" });

    const again = setup({ linked: "task-1" });
    await expect(again.inbound.opened(CONTEXT, ISSUE)).resolves.toMatchObject({ ignoredReason: expect.stringContaining("already has a task") });
    expect(again.deps.tickets.createTicket).not.toHaveBeenCalled();
  });

  it("updates the linked task when the issue is edited", async () => {
    const { deps, inbound } = setup({ linked: "task-1" });

    await inbound.edited(CONTEXT, { key: "WEB-12", title: " Gift notes v2 ", description: "Now with emoji." });

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("task-1", { title: "Gift notes v2", description: "Now with emoji." });
  });

  it("posts a comment from someone without an account under their name, and asks the agent when it mentions the bot", async () => {
    const { deps, inbound } = setup({ linked: "task-1" });

    const plain = await inbound.commented(CONTEXT, { issueKey: "WEB-12", author: { name: "Pat", email: null }, body: "Looks good", mentionsBot: false });
    expect(plain).toEqual({ ticketId: "task-1" });
    expect(deps.discussion.createFromTracker).toHaveBeenCalledWith("task-1", { userId: null, name: "Pat", source: "jira" }, "Looks good");
    expect(deps.turns.ask).not.toHaveBeenCalled();

    const ask = await inbound.commented(CONTEXT, { issueKey: "WEB-12", author: { name: "Pat", email: null }, body: "write the plan", mentionsBot: true });
    expect(ask).toEqual({ ticketId: "task-1", jobId: "job-ask" });
    expect(deps.turns.ask).toHaveBeenCalledWith("task-1", null, { message: "write the plan", postedMessageId: "message-1", fromWebhook: true });
  });

  it("answers the agent's question when the person it asked replies on the issue", async () => {
    const { deps, inbound } = setup({ linked: "task-1", users: { "maria@example.com": "user-maria" }, openQuestionFor: "user-maria" });

    const result = await inbound.commented(CONTEXT, { issueKey: "WEB-12", author: { name: "Maria", email: "maria@example.com" }, body: "North", mentionsBot: false });

    expect(result).toEqual({ ticketId: "task-1", jobId: "job-answer" });
    expect(deps.answers.answer).toHaveBeenCalledWith("task-1", "q-1", "user-maria", "North");
    expect(deps.discussion.createFromTracker).not.toHaveBeenCalled();
  });

  it("ignores its own comments and comments on issues with no task", async () => {
    const own = setup({ linked: "task-1" });
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
