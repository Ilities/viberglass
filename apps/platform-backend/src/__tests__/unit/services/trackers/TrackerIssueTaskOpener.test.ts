import type { TrackerContext, TrackerIssue } from "../../../../services/trackers/TrackerIssueInbound";
import { TrackerIssueTaskOpener } from "../../../../services/trackers/TrackerIssueTaskOpener";

const CONTEXT: TrackerContext = { provider: "jira", integrationId: "conn-1", webhookConfigId: "hook-1" };
const ISSUE: TrackerIssue & { title: string } = {
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

function setup() {
  const deps = {
    tickets: { createTicket: jest.fn().mockResolvedValue({ id: "task-1" }), updateTicket: jest.fn() },
    links: { create: jest.fn() },
    users: { findByEmail: jest.fn().mockResolvedValue({ id: "user-maria", deactivatedAt: null }) },
    planner: { request: jest.fn().mockResolvedValue("job-plan") },
  };
  return { deps, opener: new TrackerIssueTaskOpener(deps) };
}

describe("TrackerIssueTaskOpener", () => {
  it("creates the space's task, linked to the issue, with the matching person as requester", async () => {
    const { deps, opener } = setup();

    await expect(opener.open(CONTEXT, ISSUE, { projectId: "space-1", plan: false })).resolves.toEqual({ ticketId: "task-1", projectId: "space-1" });

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

  it("asks for the plan when the space plans the issues it takes", async () => {
    const { deps, opener } = setup();

    await expect(opener.open(CONTEXT, ISSUE, { projectId: "space-1", plan: true })).resolves.toEqual({ ticketId: "task-1", projectId: "space-1", jobId: "job-plan" });
    expect(deps.planner.request).toHaveBeenCalledWith("task-1");
  });
});
