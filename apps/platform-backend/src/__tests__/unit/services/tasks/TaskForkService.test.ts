import { TaskForkService } from "../../../../services/tasks/TaskForkService";
import type { Ticket } from "@viberglass/types";

const ORIGINAL: Ticket = {
  id: "task-1",
  key: "WEB-1",
  projectId: "web",
  timestamp: "2026-10-06T10:00:00Z",
  title: "Gift notes",
  description: "Let customers add a note.",
  severity: "medium",
  category: "General",
  status: "open",
  workflowPhase: "planning",
  metadata: { timestamp: "2026-10-06T10:00:00Z", timezone: "UTC" },
  annotations: [],
  ticketSystem: "native",
  autoFixRequested: false,
  createdAt: "2026-10-06T10:00:00Z",
  updatedAt: "2026-10-06T10:00:00Z",
};

const AT = new Date("2026-10-20T10:00:00Z");

function setup() {
  const deps = {
    tickets: { createTicket: jest.fn().mockResolvedValue({ id: "task-2" }) },
    forks: {
      copyThread: jest.fn().mockResolvedValue(undefined),
      addMessages: jest.fn().mockResolvedValue(undefined),
      planAt: jest.fn().mockResolvedValue("## Plan"),
      summaryAt: jest.fn().mockResolvedValue("So far"),
    },
    sessionMessages: {
      listForTask: jest.fn().mockResolvedValue([
        { id: "turn-1", sessionId: "s-1", author: { id: "user-2", name: "Maria" }, body: "Keep dark as the default", createdAt: new Date("2026-10-20T09:00:00Z") },
        { id: "turn-2", sessionId: "s-1", author: null, body: "Said after the fork", createdAt: new Date("2026-10-20T11:00:00Z") },
      ]),
    },
    participants: { list: jest.fn().mockResolvedValue([{ userId: "owner-1", role: "owner" }, { userId: "user-1", role: "requester" }]) },
    documents: { saveDocument: jest.fn().mockResolvedValue({}) },
    summaries: { create: jest.fn().mockResolvedValue({}) },
  };
  return { deps, forks: new TaskForkService(deps) };
}

describe("TaskForkService", () => {
  it("creates a native task in the same space with the original's owner", async () => {
    const { deps, forks } = setup();

    await expect(forks.fork(ORIGINAL, AT, "Gift notes · Claude Code", "user-1")).resolves.toEqual({ id: "task-2" });

    expect(deps.tickets.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "web",
        title: "Gift notes · Claude Code",
        description: "Let customers add a note.",
        ticketSystem: "native",
        requesterId: "user-1",
        ownerId: "owner-1",
      }),
    );
  });

  it("copies the thread, what people said in live sessions, the plan and summary as they were at the fork", async () => {
    const { deps, forks } = setup();

    await forks.fork(ORIGINAL, AT, "Gift notes · Claude Code", "user-1");

    expect(deps.forks.copyThread).toHaveBeenCalledWith("task-1", "task-2", AT);
    expect(deps.forks.addMessages).toHaveBeenCalledWith("task-2", [
      { authorId: "user-2", body: "Keep dark as the default", at: new Date("2026-10-20T09:00:00Z") },
    ]);
    expect(deps.forks.planAt).toHaveBeenCalledWith("task-1", AT);
    expect(deps.documents.saveDocument).toHaveBeenCalledWith("task-2", "planning", "## Plan", { source: "agent" });
    expect(deps.summaries.create).toHaveBeenCalledWith("task-2", "So far", null);
  });

  it("writes no plan or summary when the original had none yet", async () => {
    const { deps, forks } = setup();
    deps.forks.planAt.mockResolvedValue(null);
    deps.forks.summaryAt.mockResolvedValue(null);

    await forks.fork(ORIGINAL, AT, "Gift notes · Claude Code", "user-1");

    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
    expect(deps.summaries.create).not.toHaveBeenCalled();
  });
});
