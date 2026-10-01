import { myTaskGroup } from "@viberglass/types";
import { resolveNotifications, type RecipientContext } from "../../../../services/notifications/resolveNotifications";

const context: RecipientContext = {
  participants: [
    { userId: "requester", role: "requester" },
    { userId: "owner", role: "owner" },
    { userId: "watcher", role: "watcher" },
    { userId: "reviewer", role: "reviewer" },
  ],
  adminIds: ["admin-1", "admin-2"],
};

const notify = (kind: Parameters<typeof resolveNotifications>[0]["kind"], payload: Record<string, unknown> = {}, actorId: string | null = "someone") =>
  resolveNotifications({ kind, actorId, payload }, context);

describe("resolveNotifications (plan §8)", () => {
  it.each([
    ["reviewer_added", { userId: "reviewer" }, [{ userId: "reviewer", kind: "review_requested" }]],
    ["owner_changed", { userId: "owner" }, [{ userId: "owner", kind: "task_assigned" }]],
    ["message_posted", { mentioned: ["watcher", "owner"] }, [{ userId: "watcher", kind: "mentioned" }, { userId: "owner", kind: "mentioned" }]],
    [
      "run_finished",
      { step: "research" },
      [
        { userId: "requester", kind: "step_completed" },
        { userId: "owner", kind: "step_completed" },
        { userId: "watcher", kind: "step_completed" },
      ],
    ],
    ["run_failed", { category: "setup" }, [{ userId: "admin-1", kind: "run_failed_setup" }, { userId: "admin-2", kind: "run_failed_setup" }]],
    ["run_failed", { category: "platform" }, [{ userId: "admin-1", kind: "run_failed_setup" }, { userId: "admin-2", kind: "run_failed_setup" }]],
    ["run_failed", { category: "agent" }, [{ userId: "owner", kind: "run_failed_agent" }]],
    ["task_done", {}, [{ userId: "requester", kind: "task_done" }]],
    ["comment_added", {}, []],
  ] as const)("%s %j notifies the right people", (kind, payload, expected) => {
    expect(notify(kind, payload)).toEqual(expected);
  });

  it("asks the plan's reviewers to review a finished plan, and tells everyone else it's ready", () => {
    expect(notify("run_finished", { step: "planning" })).toEqual([
      { userId: "reviewer", kind: "review_requested" },
      { userId: "requester", kind: "step_completed" },
      { userId: "owner", kind: "step_completed" },
      { userId: "watcher", kind: "step_completed" },
    ]);
  });

  it("asks the owner to review a finished plan when the task has no reviewers", () => {
    const noReviewers = { ...context, participants: context.participants.filter((p) => p.role !== "reviewer") };
    expect(resolveNotifications({ kind: "run_finished", actorId: null, payload: { step: "planning" } }, noReviewers)).toEqual([
      { userId: "owner", kind: "review_requested" },
      { userId: "requester", kind: "step_completed" },
      { userId: "watcher", kind: "step_completed" },
    ]);
  });

  it("never tells people about their own actions", () => {
    expect(notify("run_finished", {}, "owner").map((r) => r.userId)).toEqual(["requester", "watcher"]);
    expect(notify("reviewer_added", { userId: "me" }, "me")).toEqual([]);
  });

  it("falls back to the requester when an agent failure has no owner", () => {
    const noOwner = { ...context, participants: [{ userId: "requester", role: "requester" as const }] };
    expect(resolveNotifications({ kind: "run_failed", actorId: null, payload: { category: "agent" } }, noOwner)).toEqual([
      { userId: "requester", kind: "run_failed_agent" },
    ]);
  });

  it("sends one item per person even when they hold several roles", () => {
    const both = { ...context, participants: [{ userId: "pm", role: "requester" as const }, { userId: "pm", role: "owner" as const }] };
    expect(resolveNotifications({ kind: "run_finished", actorId: null, payload: {} }, both)).toHaveLength(1);
  });
});

describe("myTaskGroup (J10)", () => {
  it.each([
    ["resolved", ["owner"], "done"],
    ["in_progress", ["owner"], "agent_working"],
    ["in_review", ["reviewer"], "waiting_on_me"],
    ["in_review", ["owner"], "waiting_on_me"],
    ["in_review", ["requester"], "waiting_on_others"],
    ["open", ["owner"], "waiting_on_me"],
    ["open", ["requester"], "waiting_on_others"],
  ] as const)("%s as %j is %s", (status, roles, group) => {
    expect(myTaskGroup(status, [...roles])).toBe(group);
  });
});
