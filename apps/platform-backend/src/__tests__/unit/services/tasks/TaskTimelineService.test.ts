import type { TaskActivityEntry } from "@viberglass/types";
import { TaskTimelineService } from "../../../../services/tasks/TaskTimelineService";

const MARIA = { id: "maria", name: "Maria" };

function activity(id: string, at: string, kind: TaskActivityEntry["kind"]): TaskActivityEntry {
  return { id, ticketId: "t", actorType: "human", actor: MARIA, kind, payload: {}, createdAt: at };
}

function revision(id: string, at: string, phase: "research" | "planning", source: "agent" | "manual", author: typeof MARIA | null = null) {
  return {
    id,
    documentId: `doc-${phase}`,
    ticketId: "t",
    phase,
    content: "…",
    source,
    actor: author ? "maria@example.com" : null,
    createdAt: new Date(at),
    authorId: author?.id ?? null,
    authorName: author?.name ?? null,
  };
}

function service(sources: {
  messages?: Array<{ id: string; at: string; body: string }>;
  sessionMessages?: Array<{ id: string; at: string; body: string }>;
  revisions?: ReturnType<typeof revision>[];
  activity?: TaskActivityEntry[];
}) {
  return new TaskTimelineService({
    messages: {
      list: jest.fn(async () =>
        (sources.messages ?? []).map((m) => ({ id: m.id, ticketId: "t", author: MARIA, body: m.body, createdAt: m.at, editedAt: null })),
      ),
    },
    sessionMessages: {
      listForTask: jest.fn(async () =>
        (sources.sessionMessages ?? []).map((m) => ({ id: m.id, sessionId: "s-1", author: MARIA, body: m.body, createdAt: new Date(m.at) })),
      ),
    },
    revisions: { listByTicketWithAuthors: jest.fn(async () => sources.revisions ?? []) },
    activity: { list: jest.fn(async () => sources.activity ?? []) },
  });
}

describe("TaskTimelineService", () => {
  it("puts messages, document versions and events in one thread, oldest first", async () => {
    const thread = await service({
      messages: [{ id: "m-1", at: "2026-10-01T10:05:00.000Z", body: "Which tone fits?" }],
      sessionMessages: [{ id: "turn-1", at: "2026-10-01T10:03:00.000Z", body: "Look at the checkout too" }],
      revisions: [revision("r-1", "2026-10-01T10:04:00.000Z", "research", "agent")],
      activity: [activity("a-1", "2026-10-01T10:00:00.000Z", "task_created")],
    }).list("t");

    expect(thread.map((entry) => entry.id)).toEqual(["a-1", "turn-1", "r-1", "m-1"]);
    expect(thread[1]).toMatchObject({ kind: "message", channel: "session", sessionId: "s-1" });
    expect(thread[3]).toMatchObject({ kind: "message", channel: "thread", sessionId: null });
  });

  it("numbers each document's versions on its own, and credits hand edits to their author", async () => {
    const thread = await service({
      revisions: [
        revision("r-1", "2026-10-01T10:00:00.000Z", "research", "agent"),
        revision("r-2", "2026-10-01T10:01:00.000Z", "planning", "agent"),
        revision("r-3", "2026-10-01T10:02:00.000Z", "research", "manual", MARIA),
      ],
    }).list("t");

    expect(thread).toEqual([
      expect.objectContaining({ id: "r-1", artifact: "research", version: 1, byAgent: true, author: null }),
      expect.objectContaining({ id: "r-2", artifact: "plan", version: 1, byAgent: true }),
      expect.objectContaining({ id: "r-3", artifact: "research", version: 2, byAgent: false, author: MARIA }),
    ]);
  });

  it("leaves out activity the thread already shows as a message or a version", async () => {
    const thread = await service({
      activity: [
        activity("posted", "2026-10-01T10:00:00.000Z", "message_posted"),
        activity("edited", "2026-10-01T10:01:00.000Z", "document_edited"),
        activity("owner", "2026-10-01T10:02:00.000Z", "owner_changed"),
      ],
    }).list("t");

    expect(thread.map((entry) => entry.id)).toEqual(["owner"]);
  });

  it("shows a message before what it caused when both happen at once", async () => {
    const at = "2026-10-01T10:00:00.000Z";
    const thread = await service({
      messages: [{ id: "m-1", at, body: "Go" }],
      activity: [activity("run", at, "run_started")],
      revisions: [revision("r-1", at, "research", "agent")],
    }).list("t");

    expect(thread.map((entry) => entry.kind)).toEqual(["message", "artifact_version", "event"]);
  });
});
