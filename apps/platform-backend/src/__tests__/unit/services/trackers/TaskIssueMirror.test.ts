import { isViberglassComment } from "@viberglass/integration-core";
import { TaskIssueMirror } from "../../../../services/trackers/TaskIssueMirror";

const LINK = { ticketId: "task-1", provider: "jira", issueKey: "WEB-12", issueUrl: "https://acme.atlassian.net/browse/WEB-12", integrationId: "conn-1", webhookConfigId: null, apiBaseUrl: "https://acme.atlassian.net" };

function setup(options: { linked?: boolean; sources?: Array<string | null>; produced?: string[] } = {}) {
  const commenter = { postComment: jest.fn() };
  const deps = {
    links: { getByTicket: jest.fn().mockResolvedValue(options.linked === false ? null : LINK) },
    commenters: { resolve: jest.fn().mockResolvedValue(commenter) },
    turns: {
      getByJobId: jest.fn().mockResolvedValue({
        id: "turn-1",
        agent: { id: "a", name: "Claude" },
        outcome: { reply: "I wrote the plan.", produced: options.produced ?? ["plan"] },
      }),
    },
    messages: { sourcesAnsweredBy: jest.fn().mockResolvedValue(options.sources ?? [null]) },
    questions: { getById: jest.fn() },
    documents: { getOrCreateDocument: jest.fn().mockResolvedValue({ content: "# Plan\n\nAdd a note field to checkout.\n\n## Part 1: Field" }) },
    tickets: { getSummary: jest.fn().mockResolvedValue({ title: "Gift notes", key: "WEB-1", spaceSlug: "web", pullRequestUrl: "https://github.com/acme/web/pull/7" }) },
  };
  return { commenter, deps, mirror: new TaskIssueMirror(deps) };
}

const finished = { ticketId: "task-1", kind: "run_finished" as const, actorId: null, payload: { jobId: "job-1" } };
const posted = (commenter: { postComment: jest.Mock }) => commenter.postComment.mock.calls.map(([, body]: [unknown, string]) => body);

describe("TaskIssueMirror", () => {
  it("posts the plan's summary to the linked issue, marked as its own", async () => {
    const { commenter, mirror } = setup();

    await mirror.onActivity(finished);

    expect(commenter.postComment).toHaveBeenCalledTimes(1);
    const [issue, body] = commenter.postComment.mock.calls[0];
    expect(issue).toEqual({ key: "WEB-12", url: LINK.issueUrl, apiBaseUrl: LINK.apiBaseUrl });
    expect(body).toContain("The plan is ready.");
    expect(body).toContain("Add a note field to checkout.");
    expect(isViberglassComment(body)).toBe(true);
  });

  it("posts the agent's reply only when it was asked from the issue", async () => {
    const fromApp = setup({ produced: [] });
    await fromApp.mirror.onActivity(finished);
    expect(fromApp.commenter.postComment).not.toHaveBeenCalled();

    const fromIssue = setup({ produced: [], sources: ["jira"] });
    await fromIssue.mirror.onActivity(finished);
    expect(posted(fromIssue.commenter)[0]).toContain("**Claude:** I wrote the plan.");
  });

  it("posts the pull request and done", async () => {
    const { commenter, mirror } = setup({ produced: ["code"] });

    await mirror.onActivity(finished);
    await mirror.onActivity({ ticketId: "task-1", kind: "pull_request_merged", actorId: null, payload: {} });

    expect(posted(commenter)[0]).toContain("Pull request opened:** https://github.com/acme/web/pull/7");
    expect(posted(commenter)[1]).toContain("**Done.**");
  });

  it("does nothing for a task with no linked issue, or for messages written in Viberglass", async () => {
    const unlinked = setup({ linked: false });
    await unlinked.mirror.onActivity(finished);
    expect(unlinked.deps.commenters.resolve).not.toHaveBeenCalled();

    const linked = setup();
    await linked.mirror.onActivity({ ticketId: "task-1", kind: "message_posted", actorId: "user-1", payload: { messageId: "m-1" } });
    expect(linked.commenter.postComment).not.toHaveBeenCalled();
  });
});
