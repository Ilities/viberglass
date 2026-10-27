import type { TaskSituation } from "@viberglass/types";
import { HomeService } from "../../../../services/home/HomeService";
import { OverviewService } from "../../../../services/home/OverviewService";

const row = (id: string, roles: Array<"owner" | "watcher"> = ["owner"]) => ({
  id,
  key: `WEB-${id}`,
  title: `Task ${id}`,
  status: "open" as const,
  pullRequestUrl: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-01T08:00:00Z"),
  spaceSlug: "web",
  spaceName: "Web shop",
  roles,
});

const situation = (overrides: Partial<TaskSituation>): TaskSituation => ({
  state: "artifact_ready",
  label: "Plan v1 ready",
  waitingOn: { kind: "people", people: [{ id: "me", name: "Me" }] },
  since: "2026-10-01T09:00:00Z",
  yourMove: false,
  ...overrides,
});

const described = (entries: Array<[string, TaskSituation, string]>) =>
  new Map(entries.map(([id, value, latestActivityAt]) => [id, { situation: value, mentionsYou: id === "2", attentionRequests: value.yourMove && (value.state === "question" || id === "2") ? [{ source: `source-${id}`, kind: value.state === "question" ? "question" : "mention", questionIds: [], questionText: null }] : [], completion: id === "done" ? { at: "2026-10-03T10:00:00Z", kind: "task_done" } : null, lastMessage: null, latestActivityAt }]));

describe("HomeService", () => {
  it("puts the threads where it's your move first, and the rest by latest activity, with unread counts", async () => {
    const service = new HomeService({
      access: { visibleProjectIds: jest.fn().mockResolvedValue(["space-1"]) },
      list: { listFor: jest.fn().mockResolvedValue([row("1"), row("2", ["watcher"]), row("3")]) },
      situations: {
        describe: jest.fn().mockResolvedValue(
          described([
            ["1", situation({ yourMove: false }), "2026-10-01T09:00:00Z"],
            ["2", situation({ yourMove: true }), "2026-10-01T08:30:00Z"],
            ["3", situation({ yourMove: false }), "2026-10-01T11:00:00Z"],
          ]),
        ),
      },
      reads: { unreadCounts: jest.fn().mockResolvedValue(new Map([["3", 4]])) },
      attention: { list: jest.fn().mockResolvedValue([]) },
    });

    const home = await service.load({ id: "me", role: "member" });

    expect(home.needsYou.map((thread) => thread.task.id)).toEqual(["2"]);
    expect(home.threads.map((thread) => [thread.task.id, thread.unread])).toEqual([
      ["3", 4],
      ["1", 0],
    ]);
    expect(home.needsYou[0]).toMatchObject({ roles: ["watcher"], task: { key: "WEB-2", spaceSlug: "web" } });
  });

  it("keeps deferred requests out of the badge, restores due reminders, and ignores older dispositions", async () => {
    const rows = [row("1"), row("2"), row("3"), row("4")];
    const service = new HomeService({
      access: { visibleProjectIds: jest.fn().mockResolvedValue(["space-1"]) },
      list: { listFor: jest.fn().mockResolvedValue(rows) },
      situations: { describe: jest.fn().mockResolvedValue(described(rows.map((entry) => [entry.id, situation({ state: "question", yourMove: true }), "2026-10-01T09:00:00Z"]))) },
      reads: { unreadCounts: jest.fn().mockResolvedValue(new Map()) },
      attention: { list: jest.fn().mockResolvedValue([
        { ticketId: "1", source: "source-1", mode: "waiting", reason: "Discussing with Maria", remindAt: null },
        { ticketId: "2", source: "source-2", mode: "acknowledged", reason: null, remindAt: null },
        { ticketId: "3", source: "source-3", mode: "later", reason: null, remindAt: new Date("2026-10-02T09:00:00Z") },
        { ticketId: "4", source: "old-request", mode: "waiting", reason: "Old question", remindAt: null },
      ]) },
      now: () => new Date("2026-10-03T09:00:00Z"),
    });
    const home = await service.load({ id: "me", role: "member" });
    expect(home.waiting?.map((thread) => thread.task.id)).toEqual(["1"]);
    expect(home.needsYou.map((thread) => [thread.task.id, thread.attention?.status])).toEqual([["3", "new"], ["4", "new"], ["2", "acknowledged"]]);
    expect(home.newCount).toBe(2);
  });

  it("does not treat ownership alone as a new request", async () => {
    const service = new HomeService({
      access: { visibleProjectIds: jest.fn().mockResolvedValue(["space-1"]) },
      list: { listFor: jest.fn().mockResolvedValue([row("1")]) },
      situations: { describe: jest.fn().mockResolvedValue(described([["1", situation({ state: "pr_open", yourMove: true }), "2026-10-01T09:00:00Z"]])) },
      reads: { unreadCounts: jest.fn().mockResolvedValue(new Map()) },
      attention: { list: jest.fn().mockResolvedValue([]) },
    });
    const home = await service.load({ id: "me", role: "member" });
    expect(home.needsYou).toEqual([]);
    expect(home.newCount).toBe(0);
    expect(home.threads).toHaveLength(1);
  });

  it("keeps an older deferred question visible when a new question arrives on the same task", async () => {
    const service = new HomeService({
      access: { visibleProjectIds: jest.fn().mockResolvedValue(["space-1"]) },
      list: { listFor: jest.fn().mockResolvedValue([row("1")]) },
      situations: { describe: jest.fn().mockResolvedValue(new Map([["1", {
        situation: situation({ state: "question", yourMove: true }), mentionsYou: false, lastMessage: null, latestActivityAt: "2026-10-01T09:00:00Z", completion: null,
        attentionRequests: [
          { source: "question:old", kind: "question", questionIds: ["old"], questionText: "Earlier question?" },
          { source: "question:new", kind: "question", questionIds: ["new"], questionText: "New question?" },
        ],
      }]])) },
      reads: { unreadCounts: jest.fn().mockResolvedValue(new Map()) },
      attention: { list: jest.fn().mockResolvedValue([{ ticketId: "1", source: "question:old", mode: "waiting", reason: "Outside discussion", remindAt: null }]) },
    });
    const home = await service.load({ id: "me", role: "member" });
    expect(home.needsYou[0].questionText).toBe("New question?");
    expect(home.waiting?.[0].attention?.reason).toBe("Outside discussion");
    expect(home.waiting?.[0].questionText).toBe("Earlier question?");
    expect(home.newCount).toBe(1);
  });
});

describe("OverviewService", () => {
  it("puts each task in exactly one group, so the counts add up, per space", async () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const service = new OverviewService({
      access: { visibleProjectIds: jest.fn().mockResolvedValue(null) },
      list: {
        listCurrent: jest
          .fn()
          .mockResolvedValue(["failed", "question", "old", "fresh", "live", "unstarted", "stale-unstarted", "done"].map((id) => row(id))),
      },
      situations: {
        describe: jest.fn().mockResolvedValue(
          described([
            ["failed", situation({ state: "failed" }), ""],
            ["question", situation({ state: "question", since: "2026-10-03T11:00:00Z" }), ""],
            ["old", situation({ since: "2026-10-01T09:00:00Z" }), ""],
            ["fresh", situation({ since: "2026-10-03T11:00:00Z" }), ""],
            ["live", situation({ state: "agent_working", waitingOn: { kind: "agent" }, since: "2026-10-01T09:00:00Z" }), ""],
            ["unstarted", situation({ state: "not_started", since: "2026-10-03T11:00:00Z" }), ""],
            ["stale-unstarted", situation({ state: "not_started", since: "2026-10-01T09:00:00Z" }), ""],
            ["done", situation({ state: "done", waitingOn: { kind: "nobody" } }), ""],
          ]),
        ),
      },
      now: () => now,
    });

    const overview = await service.load({ id: "viewer", role: "viewer" });
    const ids = (list: Array<{ task: { id: string } }>) => list.map((item) => item.task.id);

    expect(ids(overview.needsAttention)).toEqual(["failed", "question"]);
    expect(ids(overview.liveNow)).toEqual(["live"]);
    expect(ids(overview.waiting)).toEqual(["old", "fresh"]);
    // Not started is its own group, never "in progress".
    expect(ids(overview.notStarted)).toEqual(["unstarted", "stale-unstarted"]);
    expect(ids(overview.doneThisWeek)).toEqual(["done"]);
    expect(overview.spaces).toEqual([
      { slug: "web", name: "Web shop", needsAttention: 2, liveNow: 1, waiting: 2, notStarted: 2, doneThisWeek: 1 },
    ]);
  });

  it("counts completion events in the last seven days and does not treat an open PR as a merge", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const rows = ["recent", "old", "unknown"].map((id) => ({ ...row(id), status: "resolved" as const, pullRequestUrl: "https://example.com/pull/1" }));
    const records = described(rows.map((entry) => [entry.id, situation({ state: "done", waitingOn: { kind: "nobody" } }), "2026-10-15T10:00:00Z"]));
    const recent = records.get("recent");
    const old = records.get("old");
    if (!recent || !old) throw new Error("Missing fixtures");
    recent.completion = { at: "2026-10-14T09:00:00Z", kind: "task_done" };
    old.completion = { at: "2026-10-01T09:00:00Z", kind: "task_done" };
    const service = new OverviewService({
      access: { visibleProjectIds: jest.fn().mockResolvedValue(null) },
      list: { listCurrent: jest.fn().mockResolvedValue(rows) },
      situations: { describe: jest.fn().mockResolvedValue(records) },
      now: () => now,
    });
    const overview = await service.load({ id: "viewer", role: "viewer" });
    expect(overview.doneThisWeek).toHaveLength(1);
    expect(overview.doneThisWeek[0]).toMatchObject({ task: { id: "recent" }, completionKind: "closed", situation: { since: "2026-10-14T09:00:00Z" } });
  });

  it("keeps an intentional local takeover out of needs attention", async () => {
    const service = new OverviewService({
      access: { visibleProjectIds: jest.fn().mockResolvedValue(null) },
      list: { listCurrent: jest.fn().mockResolvedValue([row("1")]) },
      situations: { describe: jest.fn().mockResolvedValue(described([["1", situation({ state: "paused", label: "Taken over locally" }), "2026-10-01T09:00:00Z"]])) },
      now: () => new Date("2026-10-15T12:00:00Z"),
    });
    const overview = await service.load({ id: "viewer", role: "viewer" });
    expect(overview.needsAttention).toEqual([]);
    expect(overview.waiting).toHaveLength(1);
  });
});
