import type { ColumnInfo, ForeignKey } from "../../../demo/bundle/DatabaseSchema";
import type { Row } from "../../../demo/bundle/jsonValues";
import { EmailMapping } from "../../../demo/export/EmailMapping";
import { objectReferences } from "../../../demo/export/objectReferences";
import { RowSanitizer } from "../../../demo/export/RowSanitizer";
import { RowSelection } from "../../../demo/export/RowSelection";
import {
  EXCLUDED_OBJECT_PREFIXES,
  EXCLUDED_TABLES,
  EXPORTED_TABLES,
  STRIPPED_JSON_KEYS,
  type SelectionContext,
} from "../../../demo/export/tablePolicies";

const column = (name: string, type = "text", nullable = true): ColumnInfo => ({ name, type, nullable });
const fk = (table: string, columnName: string, references: string, nullable = true): ForeignKey => ({
  table,
  column: columnName,
  references,
  referencedColumn: "id",
  nullable,
});
const everything: SelectionContext = { spaceIds: null, excludedUserIds: new Set(), excludedTaskIds: new Set(), excludedJobIds: new Set(), jobProjects: new Map() };
const exportedAt = new Date("2026-11-01T12:00:00Z");

describe("the export's table allowlist", () => {
  it("leaves out every table that holds credentials, sessions or history no one should publish", () => {
    for (const table of ["secrets", "integration_credentials", "webhook_provider_configs", "webhook_delivery_attempts", "user_sessions", "api_tokens", "invites", "password_reset_links", "audit_log", "clanker_config_files", "app_sessions", "app_handoff_codes"]) {
      expect(EXPORTED_TABLES[table]).toBeUndefined();
      expect(EXCLUDED_TABLES.has(table)).toBe(true);
    }
  });

  it("exports nothing from a table it has no policy for", () => {
    const selected = new RowSelection(EXPORTED_TABLES, []).select(new Map([["brand_new_table", [{ id: "1" }]]]), everything);
    expect(selected.has("brand_new_table")).toBe(false);
  });
});

describe("RowSelection", () => {
  it("drops rows whose required reference points outside the export and clears optional ones", () => {
    const source = new Map<string, Row[]>([
      ["users", [{ id: "u1" }, { id: "admin" }]],
      ["projects", [{ id: "p1" }]],
      ["space_members", [{ project_id: "p1", user_id: "u1" }, { project_id: "p1", user_id: "admin" }]],
      ["tickets", [{ id: "t1", project_id: "p1", taken_over_by: "admin" }]],
    ]);
    const keys = [fk("space_members", "user_id", "users", false), fk("space_members", "project_id", "projects", false), fk("tickets", "project_id", "projects", false), fk("tickets", "taken_over_by", "users")];
    const selected = new RowSelection(EXPORTED_TABLES, keys).select(source, { ...everything, excludedUserIds: new Set(["admin"]) });
    expect(selected.get("users")).toEqual([{ id: "u1" }]);
    expect(selected.get("space_members")).toEqual([{ project_id: "p1", user_id: "u1" }]);
    expect(selected.get("tickets")).toEqual([{ id: "t1", project_id: "p1", taken_over_by: null }]);
  });

  it("keeps only app settings that aren't secrets", () => {
    const source = new Map<string, Row[]>([["app_settings", [{ name: "APPROVER_EMAIL", secret_id: null }, { name: "API_KEY", secret_id: "s1" }]]]);
    expect(new RowSelection(EXPORTED_TABLES, []).select(source, everything).get("app_settings")).toEqual([{ name: "APPROVER_EMAIL", secret_id: null }]);
  });

  it("follows the chosen spaces down to their tasks, jobs and logs, and leaves sign-in jobs out", () => {
    const source = new Map<string, Row[]>([
      ["projects", [{ id: "p1" }, { id: "p2" }]],
      ["tickets", [{ id: "t1", project_id: "p1" }, { id: "t2", project_id: "p2" }]],
      ["jobs", [{ id: "j1", ticket_id: "t1", job_kind: "execution" }, { id: "j2", ticket_id: "t2", job_kind: "execution" }, { id: "j3", ticket_id: null, job_kind: "agent_login" }]],
      ["job_log_lines", [{ id: "l1", job_id: "j1" }, { id: "l2", job_id: "j2" }]],
    ]);
    const keys = [fk("tickets", "project_id", "projects", false), fk("jobs", "ticket_id", "tickets"), fk("job_log_lines", "job_id", "jobs", false)];
    const context: SelectionContext = { ...everything, spaceIds: new Set(["p1"]), jobProjects: new Map([["j1", "p1"], ["j2", "p2"]]) };
    const selected = new RowSelection(EXPORTED_TABLES, keys).select(source, context);
    expect(selected.get("tickets")?.map((row) => row.id)).toEqual(["t1"]);
    expect(selected.get("jobs")?.map((row) => row.id)).toEqual(["j1"]);
    expect(selected.get("job_log_lines")?.map((row) => row.id)).toEqual(["l1"]);
  });

  it("keeps pull request outcomes and media only while an exported row points at them", () => {
    const source = new Map<string, Row[]>([
      ["task_pull_requests", [{ id: "pr", url: "https://github.com/a/b/pull/1" }]],
      ["pull_request_outcomes", [{ pull_request_url: "https://github.com/a/b/pull/1" }, { pull_request_url: "https://github.com/x/y/pull/9" }]],
      ["media_assets", [{ id: "m1" }, { id: "m2" }]],
      ["tickets", [{ id: "t1", screenshot_id: "m1" }]],
    ]);
    const selected = new RowSelection(EXPORTED_TABLES, [fk("tickets", "screenshot_id", "media_assets")]).select(source, everything);
    expect(selected.get("pull_request_outcomes")).toEqual([{ pull_request_url: "https://github.com/a/b/pull/1" }]);
    expect(selected.get("media_assets")).toEqual([{ id: "m1" }]);
  });
});

describe("RowSanitizer", () => {
  const emails = new EmailMapping([{ email: "Jussi@Example.com", name: "Maria Lindqvist" }], {}, "acme.invalid");
  const sanitizer = new RowSanitizer(EXPORTED_TABLES, STRIPPED_JSON_KEYS, emails, exportedAt);

  it("drops password hashes and callback tokens and rewrites people's addresses", () => {
    const users = sanitizer.sanitize("users", [{ id: "u1", email: "jussi@example.com", password_hash: "abc:def", avatar_url: "https://gravatar.com/x" }], [column("id"), column("email"), column("password_hash"), column("avatar_url")]);
    expect(users.rows).toEqual([{ id: "u1", email: "maria@acme.invalid", avatar_url: null }]);

    const jobs = sanitizer.sanitize("jobs", [{ id: "j1", callback_token: "tok", bootstrap_payload: { env: {} }, task: "Ask JUSSI@example.com" }], [column("id"), column("callback_token"), column("bootstrap_payload", "jsonb"), column("task")]);
    expect(jobs.rows).toEqual([{ id: "j1", task: "Ask maria@acme.invalid" }]);
  });

  it("keeps only a runner's name, harness and model", () => {
    const config = {
      version: 1,
      strategy: { type: "kubernetes", namespace: "workers", serviceAccount: "worker" },
      agent: { type: "opencode", model: "deepseek-v4.1-flash", apiBaseUrl: "https://internal" },
    };
    const result = sanitizer.sanitize("clankers", [{ id: "c1", name: "OpenCode", deployment_config: config, secret_bindings: [{ envVar: "KEY", secretId: "s1" }] }], [column("id"), column("name"), column("deployment_config", "jsonb"), column("secret_bindings", "jsonb")]);
    expect(result.rows[0]).toEqual({
      id: "c1",
      name: "OpenCode",
      deployment_config: { version: 1, strategy: { type: "kubernetes" }, agent: { type: "opencode", model: "deepseek-v4.1-flash" } },
      secret_bindings: [],
    });
  });

  it("removes conversation archives and signed links from JSON at any depth", () => {
    const result = sanitizer.sanitize("agent_sessions", [{ id: "s1", metadata_json: { conversationStateUrl: "s3://b/conversation-state/s1/j1.tar.gz", keep: { accessUrl: "https://x?X-Amz-Signature=1", path: "a" } } }], [column("id"), column("metadata_json", "jsonb")]);
    expect(result.rows[0].metadata_json).toEqual({ keep: { path: "a" } });
  });

  it("turns times into offsets from the export and names the columns that hold them", () => {
    const result = sanitizer.sanitize("tickets", [{ id: "t1", created_at: new Date("2026-11-01T11:00:00Z"), archived_at: null }], [column("id"), column("created_at", "timestamp without time zone"), column("archived_at", "timestamp with time zone")]);
    expect(result.rows[0]).toEqual({ id: "t1", created_at: -3_600_000, archived_at: null });
    expect(result.timestampColumns).toEqual(["created_at", "archived_at"]);
  });
});

describe("EmailMapping", () => {
  it("uses the mapping first and the first name otherwise, without accents", () => {
    const mapping = new EmailMapping(
      [{ email: "boss@real.com", name: "Elina Saari" }, { email: "kai@real.com", name: "Kai Mäkelä" }, { email: "ops@real.com", name: "Åsa Berg" }],
      { "boss@real.com": "elina.ceo@acme.invalid" },
      "acme.invalid",
    );
    expect(mapping.rewrite("boss@real.com, KAI@real.com and ops@real.com")).toBe("elina.ceo@acme.invalid, kai@acme.invalid and asa@acme.invalid");
  });

  it("refuses two people who would get the same address", () => {
    expect(() => new EmailMapping([{ email: "a@x.com", name: "Maria A" }, { email: "b@x.com", name: "Maria B" }], {}, "acme.invalid")).toThrow(/both become maria@acme.invalid/);
  });
});

describe("objectReferences", () => {
  it("collects storage URLs from rows and the app objects that follow from ids, never conversation archives", () => {
    const tables = new Map<string, Row[]>([
      ["space_file_snapshots", [{ storage_url: "s3://src/spaces/p1/snapshots/s1/workspace.tar.gz" }]],
      ["artifact_versions", [{ storage_prefix: "s3://src/spaces/p1/artifacts/a1/versions/v1/files/" }]],
      ["agent_turns", [{ content_json: { archive: "s3://src/conversation-state/s1/j1.tar.gz", note: "see s3://src/x in text" } }]],
      ["apps", [{ project_id: "p2" }]],
      ["app_releases", [{ id: "r1", project_id: "p2", bundle_sha256: "abc", bundle_purged_at: null }, { id: "r2", project_id: "p2", bundle_sha256: null }]],
      ["app_data_backups", [{ id: "b1", project_id: "p2" }]],
    ]);
    expect(objectReferences(tables, "src", EXCLUDED_OBJECT_PREFIXES)).toEqual({
      keys: ["spaces/p1/snapshots/s1/workspace.tar.gz", "spaces/p2/releases/r1/bundle.tar.gz"],
      prefixes: ["spaces/p1/artifacts/a1/versions/v1/files/", "spaces/p2/app-data/", "spaces/p2/backups/b1/"],
    });
  });
});
