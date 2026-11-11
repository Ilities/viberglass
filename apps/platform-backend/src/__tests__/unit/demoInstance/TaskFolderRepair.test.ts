import type { Row } from "../../../demo/bundle/jsonValues";
import { TaskFolderRepair } from "../../../demo/export/TaskFolderRepair";

const TICKET = "0b4c6f1e-9d2a-4c3b-8e7f-123456789abc";
const OTHER_TICKET = "7f1e2d3c-4b5a-4c6d-8e9f-abcdefabcdef";

const repair = TaskFolderRepair.from(
  new Map<string, Row[]>([
    ["agent_sessions", [{ id: "s1", ticket_id: TICKET }]],
    ["jobs", [{ id: "build_1794303692484_38d4e6f6", ticket_id: OTHER_TICKET }, { id: "claw_1794303692484_aaaa", ticket_id: null }]],
  ]),
);

describe("TaskFolderRepair", () => {
  it("restores the session's task folder in nested event payloads and leaves other values alone", () => {
    const created = new Date("2026-11-01T12:00:00Z");
    const [event] = repair.repair("agent_session_events", [
      {
        id: "e1",
        session_id: "s1",
        created_at: created,
        payload_json: {
          toolCall: { rawInput: { paths: ["/tmp/viberator-work/ta[REDACTED]/repo/src"], cwd: "/tmp/viberator-work/ta[REDACTED]/repo" } },
          output: "Output is being written to: /tmp/claude-999/-tmp-viberator-work-ta[REDACTED]/ea6eb09e/tasks/b.output",
          sequence: 4,
        },
      },
    ]);

    expect(event).toEqual({
      id: "e1",
      session_id: "s1",
      created_at: created,
      payload_json: {
        toolCall: { rawInput: { paths: [`/tmp/viberator-work/task-${TICKET}/repo/src`], cwd: `/tmp/viberator-work/task-${TICKET}/repo` } },
        output: `Output is being written to: /tmp/claude-999/-tmp-viberator-work-task-${TICKET}/ea6eb09e/tasks/b.output`,
        sequence: 4,
      },
    });
  });

  it("finds the task through the row's job, and through a job's own ticket", () => {
    const [line] = repair.repair("job_log_lines", [{ id: 1, job_id: "build_1794303692484_38d4e6f6", message: "cd /tmp/viberator-work/ta[REDACTED]/repo" }]);
    const [job] = repair.repair("jobs", [{ id: "j9", ticket_id: TICKET, result: { workdir: "/tmp/viberator-work/ta[REDACTED]" } }]);

    expect(line.message).toBe(`cd /tmp/viberator-work/task-${OTHER_TICKET}/repo`);
    expect(job.result).toEqual({ workdir: `/tmp/viberator-work/task-${TICKET}` });
  });

  it("falls back to a folder named after the job when no task is known", () => {
    const [manifest] = repair.repair("job_run_manifests", [{ id: "m1", job_id: "claw_1794303692484_aaaa", manifest: { cwd: "/tmp/viberator-work/ta[REDACTED]/repo" } }]);
    expect(manifest.manifest).toEqual({ cwd: "/tmp/viberator-work/task-claw_179/repo" });
  });

  it("leaves real redactions and rows without the marker untouched", () => {
    const rows: Row[] = [
      { id: "e2", session_id: "s1", payload_json: { text: "export KEY=[REDACTED] and data[REDACTED]" } },
      { id: "e3", session_id: "s1", payload_json: { text: "nothing here" } },
    ];
    const repaired = repair.repair("agent_session_events", rows);

    expect(repaired).toEqual(rows);
    expect(repaired[1]).toBe(rows[1]);
  });
});
