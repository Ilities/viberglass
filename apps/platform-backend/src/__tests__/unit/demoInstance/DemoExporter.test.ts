import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { ColumnInfo, SchemaSnapshot } from "../../../demo/bundle/DatabaseSchema";
import type { Row } from "../../../demo/bundle/jsonValues";
import { BundleWriter } from "../../../demo/export/BundleWriter";
import { DemoExporter, SecretsFoundError, type ExportSource } from "../../../demo/export/DemoExporter";
import { DEFAULT_EXPORT_CONFIG } from "../../../demo/export/exportConfig";

const exportedAt = new Date("2026-11-01T12:00:00Z");
const hoursBefore = (hours: number) => new Date(exportedAt.getTime() - hours * 3_600_000);
const text = (name: string): ColumnInfo => ({ name, type: "text", nullable: true });
const time = (name: string): ColumnInfo => ({ name, type: "timestamp with time zone", nullable: true });

function source(rows: Record<string, Row[]>): ExportSource {
  const schema: SchemaSnapshot = {
    columns: new Map([
      ["users", [text("id"), text("email"), text("name"), text("password_hash")]],
      ["task_activity", [text("id"), text("kind"), time("created_at")]],
      ["pull_request_outcomes", [text("pull_request_url"), time("checked_at")]],
      ["agent_sessions", [text("id"), text("ticket_id")]],
      ["agent_session_events", [text("id"), text("session_id"), { name: "payload_json", type: "jsonb", nullable: false }]],
      ["secrets", [text("id")]],
      ["shiny_new_table", [text("id")]],
    ]),
    foreignKeys: [],
    primaryKeys: new Map(),
  };
  return {
    schema: async () => schema,
    rows: async (table) => rows[table] ?? [],
    forbiddenValues: async () => [{ kind: "password hash", value: "0123456789abcdef:hash" }],
  };
}

describe("DemoExporter", () => {
  let directory: string;
  beforeEach(async () => {
    directory = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "demo-export-")), "bundle");
  });
  afterEach(async () => {
    await fs.rm(path.dirname(directory), { recursive: true, force: true });
  });

  const exporter = (rows: Record<string, Row[]>, log: string[] = []) =>
    new DemoExporter(source(rows), new BundleWriter(directory), () => ({ export: async () => ({ keys: [], contentTypes: {}, missing: [] }) }), DEFAULT_EXPORT_CONFIG, "capture", (line) => log.push(line));

  it("writes nothing when a row looks like a secret", async () => {
    const run = exporter({
      users: [{ id: "u1", email: "maria@real.com", name: "Maria", password_hash: "0123456789abcdef:hash" }],
      task_activity: [{ id: "a1", kind: "pasted ghp_abcdefghijklmnopqrstuvwxyz0123456789", created_at: hoursBefore(1) }],
    }).export(exportedAt);

    await expect(run).rejects.toBeInstanceOf(SecretsFoundError);
    await expect(fs.access(directory)).rejects.toThrow();
    await expect(fs.access(`${directory}.partial`)).rejects.toThrow();
  });

  it("restores task folders the worker redacted by mistake and still stops on a real key beside them", async () => {
    const ticket = "0b4c6f1e-9d2a-4c3b-8e7f-123456789abc";
    const rows = (text: string) => ({
      users: [{ id: "u1", email: "maria@real.com", name: "Maria", password_hash: "x" }],
      agent_sessions: [{ id: "s1", ticket_id: ticket }],
      agent_session_events: [{ id: "e1", session_id: "s1", payload_json: { cwd: text } }],
    });

    await exporter(rows("/tmp/viberator-work/ta[REDACTED]/repo")).export(exportedAt);
    const events = JSON.parse(await fs.readFile(path.join(directory, "tables", "agent_session_events.json"), "utf8"));
    expect(events[0].payload_json).toEqual({ cwd: `/tmp/viberator-work/task-${ticket}/repo` });

    await fs.rm(directory, { recursive: true, force: true });
    const leaking = exporter(rows("/tmp/viberator-work/ta[REDACTED]/repo OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz")).export(exportedAt);
    await expect(leaking).rejects.toBeInstanceOf(SecretsFoundError);
  });

  it("anchors the newest activity on what people did, not on poller times, and reports tables without a policy", async () => {
    const log: string[] = [];
    const manifest = await exporter(
      {
        users: [{ id: "u1", email: "maria@real.com", name: "Maria", password_hash: "x" }],
        task_activity: [{ id: "a1", kind: "comment", created_at: hoursBefore(5) }],
        pull_request_outcomes: [{ pull_request_url: "https://github.com/a/b/pull/1", checked_at: hoursBefore(0.1) }],
      },
      log,
    ).export(exportedAt);

    expect(manifest.newestActivityOffsetMs).toBe(-5 * 3_600_000);
    expect(log).toEqual(["Not exported, no policy yet: shiny_new_table"]);
    const users = JSON.parse(await fs.readFile(path.join(directory, "tables", "users.json"), "utf8"));
    expect(users).toEqual([{ id: "u1", email: "maria@acme.invalid", name: "Maria" }]);
    await expect(fs.access(path.join(directory, "tables", "secrets.json"))).rejects.toThrow();
  });
});
