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
  new Map(entries.map(([id, value, latestActivityAt]) => [id, { situation: value, lastMessage: null, latestActivityAt }]));

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
    });

    const home = await service.load({ id: "me", role: "member" });

    expect(home.needsYou.map((thread) => thread.task.id)).toEqual(["2"]);
    expect(home.threads.map((thread) => [thread.task.id, thread.unread])).toEqual([
      ["3", 4],
      ["1", 0],
    ]);
    expect(home.needsYou[0]).toMatchObject({ roles: ["watcher"], task: { key: "WEB-2", spaceSlug: "web" } });
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

    expect(ids(overview.needsAttention)).toEqual(["failed", "question", "old"]);
    expect(ids(overview.liveNow)).toEqual(["live"]);
    expect(ids(overview.waiting)).toEqual(["fresh"]);
    // Not started is its own group, never "in progress".
    expect(ids(overview.notStarted)).toEqual(["unstarted", "stale-unstarted"]);
    expect(ids(overview.doneThisWeek)).toEqual(["done"]);
    expect(overview.spaces).toEqual([
      { slug: "web", name: "Web shop", needsAttention: 3, liveNow: 1, waiting: 1, notStarted: 2, doneThisWeek: 1 },
    ]);
  });
});
