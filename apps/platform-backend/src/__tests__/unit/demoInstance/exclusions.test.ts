import type { ForeignKey } from "../../../demo/bundle/DatabaseSchema";
import type { Row } from "../../../demo/bundle/jsonValues";
import { DEFAULT_EXPORT_CONFIG, parseExportConfig } from "../../../demo/export/exportConfig";
import { RowSelection } from "../../../demo/export/RowSelection";
import { selectionContext } from "../../../demo/export/selectionContext";
import { EXPORTED_TABLES, LOOSE_REFERENCES } from "../../../demo/export/tablePolicies";

const fk = (table: string, column: string, references: string, nullable = false): ForeignKey => ({ table, column, references, referencedColumn: "id", nullable });

const FOREIGN_KEYS: ForeignKey[] = [
  fk("jobs", "ticket_id", "tickets", true),
  fk("jobs", "agent_session_id", "agent_sessions", true),
  fk("jobs", "agent_turn_id", "agent_turns", true),
  fk("job_log_lines", "job_id", "jobs"),
  fk("job_progress_updates", "job_id", "jobs"),
  fk("job_run_manifests", "job_id", "jobs"),
  fk("ticket_phase_runs", "ticket_id", "tickets"),
  fk("ticket_phase_runs", "job_id", "jobs"),
  fk("ticket_phase_documents", "ticket_id", "tickets"),
  fk("ticket_phase_document_revisions", "document_id", "ticket_phase_documents"),
  fk("ticket_phase_document_revisions", "agent_turn_id", "agent_turns", true),
  fk("agent_sessions", "ticket_id", "tickets"),
  fk("agent_turns", "session_id", "agent_sessions"),
  fk("agent_turns", "job_id", "jobs", true),
  fk("agent_turns", "task_message_id", "task_messages", true),
  fk("agent_session_events", "session_id", "agent_sessions"),
  fk("agent_session_events", "turn_id", "agent_turns", true),
  fk("agent_session_events", "job_id", "jobs", true),
  fk("agent_pending_requests", "session_id", "agent_sessions"),
  fk("agent_pending_requests", "turn_id", "agent_turns", true),
  fk("agent_pending_requests", "job_id", "jobs", true),
  fk("agent_pending_requests", "answer_message_id", "task_messages", true),
  fk("task_messages", "ticket_id", "tickets"),
  fk("task_message_images", "message_id", "task_messages"),
  fk("task_message_images", "media_id", "media_assets"),
  fk("task_mentions", "ticket_id", "tickets"),
  fk("task_mentions", "message_id", "task_messages", true),
  fk("task_mentions", "agent_turn_id", "agent_turns", true),
  fk("task_activity", "ticket_id", "tickets"),
  fk("task_pull_requests", "ticket_id", "tickets"),
  fk("task_comparisons", "parent_ticket_id", "tickets"),
  fk("task_comparisons", "winner_ticket_id", "tickets", true),
  fk("task_comparison_arms", "comparison_id", "task_comparisons"),
  fk("task_comparison_arms", "ticket_id", "tickets"),
  fk("tickets", "screenshot_id", "media_assets", true),
];

const ids = (tables: Map<string, Row[]>, table: string) => (tables.get(table) ?? []).map((row) => row.id);

function capture(): Map<string, Row[]> {
  return new Map<string, Row[]>([
    [
      "tickets",
      [
        { id: "t-ca3", task_key: "CA-3", screenshot_id: null },
        { id: "t-lap1", task_key: "LAP-1", screenshot_id: "m-shot" },
        { id: "t-fork", task_key: "LAP-2", screenshot_id: null },
      ],
    ],
    ["media_assets", [{ id: "m-shot", url: "s3://capture/media/shot.png" }, { id: "m-pasted", url: "s3://capture/media/pasted.png" }]],
    [
      "task_messages",
      [
        { id: "msg-ask", ticket_id: "t-ca3" },
        { id: "msg-answer", ticket_id: "t-ca3" },
        { id: "msg-lap", ticket_id: "t-lap1" },
      ],
    ],
    ["task_message_images", [{ id: "img", message_id: "msg-lap", media_id: "m-pasted" }]],
    [
      "agent_sessions",
      [
        { id: "s-failed", ticket_id: "t-ca3", last_job_id: "j-fail", last_turn_id: "turn-fail", latest_pending_request_id: null },
        { id: "s-ok", ticket_id: "t-ca3", last_job_id: "j-ok", last_turn_id: "turn-ok", latest_pending_request_id: null },
        { id: "s-lap", ticket_id: "t-lap1", last_job_id: "j-lap", last_turn_id: null, latest_pending_request_id: null },
      ],
    ],
    [
      "jobs",
      [
        { id: "j-fail", ticket_id: "t-ca3", job_kind: "planning", agent_session_id: null, agent_turn_id: null },
        { id: "j-ok", ticket_id: "t-ca3", job_kind: "planning", agent_session_id: null, agent_turn_id: null },
        { id: "j-lap", ticket_id: "t-lap1", job_kind: "execution", agent_session_id: null, agent_turn_id: null },
      ],
    ],
    [
      "agent_turns",
      [
        { id: "turn-ask", session_id: "s-failed", role: "user", job_id: null, task_message_id: "msg-ask", consumed_by_turn_id: "turn-fail" },
        { id: "turn-fail", session_id: "s-failed", role: "assistant", job_id: "j-fail", task_message_id: null, consumed_by_turn_id: null },
        { id: "turn-ok", session_id: "s-ok", role: "assistant", job_id: "j-ok", task_message_id: null, consumed_by_turn_id: null },
        { id: "turn-lap", session_id: "s-lap", role: "assistant", job_id: "j-lap", task_message_id: null, consumed_by_turn_id: null },
      ],
    ],
    [
      "agent_session_events",
      [
        { id: "e-started", session_id: "s-failed", turn_id: "turn-fail", job_id: null },
        { id: "e-output", session_id: "s-failed", turn_id: "turn-fail", job_id: "j-fail" },
        { id: "e-session", session_id: "s-failed", turn_id: null, job_id: null },
        { id: "e-ok", session_id: "s-ok", turn_id: "turn-ok", job_id: "j-ok" },
      ],
    ],
    [
      "agent_pending_requests",
      [{ id: "q-notes", session_id: "s-failed", turn_id: "turn-fail", job_id: "j-fail", answer_message_id: "msg-answer" }],
    ],
    ["job_log_lines", [{ id: "log-fail", job_id: "j-fail" }, { id: "log-ok", job_id: "j-ok" }, { id: "log-lap", job_id: "j-lap" }]],
    ["job_progress_updates", [{ id: "p-fail", job_id: "j-fail" }, { id: "p-ok", job_id: "j-ok" }]],
    ["job_run_manifests", [{ id: "man-fail", job_id: "j-fail", ticket_id: "t-ca3" }, { id: "man-ok", job_id: "j-ok", ticket_id: "t-ca3" }]],
    ["ticket_phase_runs", [{ id: "run-fail", ticket_id: "t-ca3", job_id: "j-fail" }, { id: "run-ok", ticket_id: "t-ca3", job_id: "j-ok" }]],
    ["ticket_phase_documents", [{ id: "doc-ca3", ticket_id: "t-ca3" }, { id: "doc-lap", ticket_id: "t-lap1" }]],
    ["ticket_phase_document_revisions", [{ id: "rev-ca3", document_id: "doc-ca3", agent_turn_id: "turn-ok" }, { id: "rev-lap", document_id: "doc-lap", agent_turn_id: "turn-lap" }]],
    [
      "task_mentions",
      [
        { id: "mention-turn", ticket_id: "t-ca3", message_id: null, agent_turn_id: "turn-fail" },
        { id: "mention-ok", ticket_id: "t-ca3", message_id: null, agent_turn_id: "turn-ok" },
      ],
    ],
    [
      "task_activity",
      [
        { id: "a-created", ticket_id: "t-ca3", kind: "task_created", payload_json: { key: "CA-3" } },
        { id: "a-started", ticket_id: "t-ca3", kind: "run_started", payload_json: { jobId: "j-fail", step: "planning" } },
        { id: "a-asked", ticket_id: "t-ca3", kind: "question_asked", payload_json: { questionId: "q-notes" } },
        { id: "a-failed", ticket_id: "t-ca3", kind: "run_failed", payload_json: { jobId: "j-fail", reason: "Something went wrong" } },
        { id: "a-ok", ticket_id: "t-ca3", kind: "run_finished", payload_json: { jobId: "j-ok" } },
        { id: "a-lap", ticket_id: "t-lap1", kind: "task_created", payload_json: { key: "LAP-1" } },
      ],
    ],
    ["task_pull_requests", [{ id: "pr-lap", ticket_id: "t-lap1", url: "https://github.com/a/b/pull/1" }]],
    ["pull_request_outcomes", [{ pull_request_url: "https://github.com/a/b/pull/1" }]],
    ["task_comparisons", [{ id: "cmp", parent_ticket_id: "t-ca3", winner_ticket_id: "t-lap1" }]],
    ["task_comparison_arms", [{ id: "arm-lap", comparison_id: "cmp", ticket_id: "t-lap1" }, { id: "arm-fork", comparison_id: "cmp", ticket_id: "t-fork" }]],
  ]);
}

type Exclusions = { excludeTasks?: string[]; excludeJobs?: string[]; excludeMessages?: string[] };

/** CA-3 after a retry: the person's message started a fresh session, and the pasted screenshot only it carried. */
function withRetry(): Map<string, Row[]> {
  const source = capture();
  const add = (table: string, rows: Row[]) => source.set(table, [...(source.get(table) ?? []), ...rows]);
  add("media_assets", [{ id: "m-retry", url: "s3://capture/media/retry.png" }]);
  add("task_messages", [{ id: "msg-retry", ticket_id: "t-ca3" }]);
  add("task_message_images", [{ id: "img-retry", message_id: "msg-retry", media_id: "m-retry" }]);
  add("agent_sessions", [{ id: "s-retry", ticket_id: "t-ca3", last_job_id: null, last_turn_id: "turn-reply", latest_pending_request_id: "q-retry" }]);
  add("agent_turns", [
    { id: "turn-retry", session_id: "s-retry", role: "user", job_id: null, task_message_id: "msg-retry", consumed_by_turn_id: "turn-reply" },
    { id: "turn-reply", session_id: "s-retry", role: "assistant", job_id: null, task_message_id: null, consumed_by_turn_id: null },
  ]);
  add("agent_session_events", [
    { id: "e-retry-said", session_id: "s-retry", turn_id: "turn-retry", job_id: null },
    { id: "e-reply", session_id: "s-retry", turn_id: "turn-reply", job_id: null },
  ]);
  add("agent_pending_requests", [{ id: "q-retry", session_id: "s-retry", turn_id: "turn-reply", job_id: null, answer_message_id: "msg-retry" }]);
  add("task_mentions", [{ id: "mention-retry", ticket_id: "t-ca3", message_id: "msg-retry", agent_turn_id: null }]);
  add("task_activity", [
    { id: "a-posted", ticket_id: "t-ca3", kind: "message_posted", payload_json: { messageId: "msg-retry", mentioned: [] } },
    { id: "a-retry-asked", ticket_id: "t-ca3", kind: "question_asked", payload_json: { questionId: "q-retry" } },
  ]);
  return source;
}

function exportWith(config: Exclusions, source = capture()): Map<string, Row[]> {
  const context = selectionContext((table) => source.get(table) ?? [], { ...DEFAULT_EXPORT_CONFIG, ...config });
  return new RowSelection(EXPORTED_TABLES, [...FOREIGN_KEYS, ...LOOSE_REFERENCES]).select(source, context);
}

describe("leaving out a task", () => {
  const selected = exportWith({ excludeTasks: ["LAP-1"] });

  it("takes its thread, runs, plan, pull requests and attachments with it", () => {
    expect(ids(selected, "tickets")).toEqual(["t-ca3", "t-fork"]);
    expect(ids(selected, "task_messages")).toEqual(["msg-ask", "msg-answer"]);
    expect(ids(selected, "task_message_images")).toEqual([]);
    expect(ids(selected, "media_assets")).toEqual([]);
    expect(ids(selected, "agent_sessions")).toEqual(["s-failed", "s-ok"]);
    expect(ids(selected, "jobs")).toEqual(["j-fail", "j-ok"]);
    expect(ids(selected, "job_log_lines")).toEqual(["log-fail", "log-ok"]);
    expect(ids(selected, "ticket_phase_document_revisions")).toEqual(["rev-ca3"]);
    expect(ids(selected, "task_activity")).not.toContain("a-lap");
    expect(ids(selected, "task_pull_requests")).toEqual([]);
    expect(selected.get("pull_request_outcomes")).toEqual([]);
  });

  it("drops it from comparisons it took part in, as a fork and as the winner", () => {
    expect(ids(selected, "task_comparison_arms")).toEqual(["arm-fork"]);
    expect(selected.get("task_comparisons")).toEqual([{ id: "cmp", parent_ticket_id: "t-ca3", winner_ticket_id: null }]);
  });

  it("takes a comparison with it when it was the parent", () => {
    const withoutParent = exportWith({ excludeTasks: ["CA-3"] });
    expect(ids(withoutParent, "task_comparisons")).toEqual([]);
    expect(ids(withoutParent, "task_comparison_arms")).toEqual([]);
    expect(ids(withoutParent, "tickets")).toEqual(["t-lap1", "t-fork"]);
  });
});

describe("leaving out a run", () => {
  const selected = exportWith({ excludeJobs: ["j-fail"] });

  it("takes its logs, progress, manifest, phase run, turn and session events with it", () => {
    expect(ids(selected, "jobs")).toEqual(["j-ok", "j-lap"]);
    expect(ids(selected, "job_log_lines")).toEqual(["log-ok", "log-lap"]);
    expect(ids(selected, "job_progress_updates")).toEqual(["p-ok"]);
    expect(ids(selected, "job_run_manifests")).toEqual(["man-ok"]);
    expect(ids(selected, "ticket_phase_runs")).toEqual(["run-ok"]);
    expect(ids(selected, "agent_turns")).toEqual(["turn-ask", "turn-ok", "turn-lap"]);
    expect(ids(selected, "agent_session_events")).toEqual(["e-session", "e-ok"]);
    expect(ids(selected, "task_mentions")).toEqual(["mention-ok"]);
  });

  it("leaves no run lines in the thread, keeps the task and the question the run asked with its answer", () => {
    expect(ids(selected, "tickets")).toContain("t-ca3");
    expect(ids(selected, "task_activity")).toEqual(["a-created", "a-asked", "a-ok", "a-lap"]);
    expect(ids(selected, "task_messages")).toEqual(["msg-ask", "msg-answer", "msg-lap"]);
    expect(selected.get("agent_pending_requests")).toEqual([{ id: "q-notes", session_id: "s-failed", turn_id: null, job_id: null, answer_message_id: "msg-answer" }]);
  });

  it("clears what still pointed at the run or its turn", () => {
    const session = selected.get("agent_sessions")?.find((row) => row.id === "s-failed");
    expect(session).toMatchObject({ last_job_id: null, last_turn_id: null });
    expect(selected.get("agent_turns")?.find((row) => row.id === "turn-ask")).toMatchObject({ consumed_by_turn_id: null });
    expect(selected.get("agent_sessions")?.find((row) => row.id === "s-ok")).toMatchObject({ last_job_id: "j-ok", last_turn_id: "turn-ok" });
  });
});

describe("leaving out a message", () => {
  const selected = exportWith({ excludeMessages: ["msg-retry"] }, withRetry());

  it("takes its mentions, attachment, activity entry and the user turn made from it with it", () => {
    expect(ids(selected, "task_messages")).toEqual(["msg-ask", "msg-answer", "msg-lap"]);
    expect(ids(selected, "task_message_images")).toEqual(["img"]);
    expect(ids(selected, "media_assets")).toEqual(["m-shot", "m-pasted"]);
    expect(ids(selected, "task_mentions")).not.toContain("mention-retry");
    expect(ids(selected, "task_activity")).not.toContain("a-posted");
    expect(ids(selected, "agent_turns")).not.toContain("turn-retry");
    expect(ids(selected, "agent_session_events")).not.toContain("e-retry-said");
  });

  it("keeps the run it started, and leaves out a question it answered", () => {
    expect(ids(selected, "agent_turns")).toContain("turn-reply");
    expect(ids(selected, "agent_session_events")).toContain("e-reply");
    expect(ids(selected, "agent_pending_requests")).toEqual(["q-notes"]);
    expect(ids(selected, "task_activity")).not.toContain("a-retry-asked");
    expect(selected.get("agent_sessions")?.find((row) => row.id === "s-retry")).toMatchObject({ last_turn_id: "turn-reply", latest_pending_request_id: null });
  });
});

describe("exclusion config", () => {
  it("stops on a task key, job id or message id the capture doesn't have", () => {
    expect(() => exportWith({ excludeTasks: ["NOPE-1"] })).toThrow("No task with the key NOPE-1");
    expect(() => exportWith({ excludeJobs: ["job_missing"] })).toThrow("No job with the id job_missing");
    expect(() => exportWith({ excludeMessages: ["msg-missing"] })).toThrow("No task message with the id msg-missing");
  });

  it("reads the lists and refuses to watch a task it leaves out", () => {
    expect(parseExportConfig({ excludeTasks: ["LAP-1"], excludeJobs: ["j1"], excludeMessages: ["m1"] })).toMatchObject({ excludeTasks: ["LAP-1"], excludeJobs: ["j1"], excludeMessages: ["m1"] });
    expect(() => parseExportConfig({ excludeMessages: [1] })).toThrow("excludeMessages must be a list of strings");
    expect(() => parseExportConfig({ excludeJobs: "j1" })).toThrow("excludeJobs must be a list of strings");
    expect(() => parseExportConfig({ excludeTasks: ["LAP-1"], viewer: { watchTaskKeys: ["LAP-1"] } })).toThrow("viewer.watchTaskKeys names excluded tasks: LAP-1");
  });
});
