import type { BundleTable } from "../../../demo/bundle/bundleManifest";
import { parseBundleManifest } from "../../../demo/bundle/bundleManifest";
import { objectKeyOf, rewriteBucketUrls } from "../../../demo/bundle/s3Urls";
import { newestPastOffset, timestampShift, toOffset } from "../../../demo/bundle/timestampOffsets";
import { insertOrder } from "../../../demo/seed/insertOrder";
import { seedRow, type SeedRowContext } from "../../../demo/seed/seedRows";

const HOUR = 3_600_000;
const now = new Date("2026-12-24T10:00:00Z");

describe("timestamp offsets", () => {
  it("measure from the export and ignore later deadlines when finding the newest activity", () => {
    const exportedAt = new Date("2026-11-01T12:00:00Z");
    expect(toOffset(new Date("2026-11-01T10:00:00Z"), exportedAt)).toBe(-2 * HOUR);
    expect(newestPastOffset([-5 * HOUR, -2 * HOUR, 30 * 24 * HOUR])).toBe(-2 * HOUR);
    expect(newestPastOffset([])).toBe(0);
  });

  it("put the newest activity a day before now and keep every gap", () => {
    const shift = timestampShift(-2 * HOUR, now, 24 * HOUR);
    expect(shift(-2 * HOUR).toISOString()).toBe("2026-12-23T10:00:00.000Z");
    expect(shift(-50 * HOUR).toISOString()).toBe("2026-12-21T10:00:00.000Z");
    expect(shift(10 * HOUR).toISOString()).toBe("2026-12-23T22:00:00.000Z");
  });
});

describe("storage URLs", () => {
  it("point every URL into the source bucket at the target, in text and JSON alike", () => {
    const value = { storage: "s3://capture/spaces/p1/a.md", note: "Copied from s3://capture/x and s3://other/y", list: ["s3://capture/z/"] };
    expect(rewriteBucketUrls(value, "capture", "viberglass")).toEqual({
      storage: "s3://viberglass/spaces/p1/a.md",
      note: "Copied from s3://viberglass/x and s3://other/y",
      list: ["s3://viberglass/z/"],
    });
  });

  it("read a key only from a value that is wholly a URL into the bucket", () => {
    expect(objectKeyOf("s3://capture/spaces/p1/a.md", "capture")).toBe("spaces/p1/a.md");
    expect(objectKeyOf("see s3://capture/spaces/p1/a.md", "capture")).toBeNull();
    expect(objectKeyOf("s3://capture-old/a", "capture")).toBeNull();
  });
});

describe("seedRow", () => {
  const context: SeedRowContext = {
    sourceBucket: "capture",
    targetBucket: "viberglass",
    shift: timestampShift(0, now, 24 * HOUR),
    secrets: { callbackToken: () => "fresh-token", lockedPasswordHash: "locked" },
  };
  const table = (name: string, timestampColumns: string[] = []): BundleTable => ({ name, rows: 1, timestampColumns });

  it("shifts times and leaves missing ones empty", () => {
    expect(seedRow(table("tickets", ["created_at", "archived_at"]), { id: "t1", created_at: -HOUR, archived_at: null }, context)).toEqual({
      id: "t1",
      created_at: "2026-12-23T09:00:00.000Z",
      archived_at: null,
    });
  });

  it("gives jobs a fresh callback token and no bootstrap payload", () => {
    expect(seedRow(table("jobs"), { id: "j1", status: "completed" }, context)).toEqual({ id: "j1", status: "completed", callback_token: "fresh-token", bootstrap_payload: null });
  });

  it("locks every exported person's password", () => {
    expect(seedRow(table("users"), { id: "u1", email: "maria@acme.invalid" }, context).password_hash).toBe("locked");
  });

  it("leaves live apps for the reconciler to start, and apps with nothing live off", () => {
    const live = seedRow(table("apps"), { project_id: "p1", power: "on", state: "running", current_release_id: "r1", busy_since: 1, restart_due: true }, context);
    expect(live).toMatchObject({ power: "on", state: "off", busy_since: null, restart_due: false, restore_backup_id: null });
    expect(seedRow(table("apps"), { project_id: "p2", power: "on", state: "failed", current_release_id: null }, context)).toMatchObject({ power: "off", state: "off" });
  });

  it("turns previews with a release on, stopped, so their reconciler starts them", () => {
    expect(seedRow(table("app_previews"), { id: "v1", release_id: "r2", running_release_id: "r2", power: "off", state: "running" }, context)).toMatchObject({ power: "on", state: "off", running_release_id: null });
  });

  it("pauses scheduled template runs and leaves app schedules as they were", () => {
    expect(seedRow(table("claw_schedules"), { id: "s1", action: "run_template", is_active: true }, context).is_active).toBe(false);
    expect(seedRow(table("claw_schedules"), { id: "s2", action: "app_restore_data", is_active: true }, context).is_active).toBe(true);
  });

  it("rewrites storage URLs to the target bucket", () => {
    expect(seedRow(table("space_file_snapshots"), { storage_url: "s3://capture/spaces/p1/snapshots/s1/workspace.tar.gz" }, context).storage_url).toBe(
      "s3://viberglass/spaces/p1/snapshots/s1/workspace.tar.gz",
    );
  });
});

describe("insertOrder", () => {
  const fk = (table: string, column: string, references: string, nullable = true) => ({ table, column, references, referencedColumn: "id", nullable });

  it("puts referenced tables first and defers the nullable side of a cycle", () => {
    const plan = insertOrder(
      ["artifacts", "artifact_versions", "projects", "space_file_snapshots"],
      [
        fk("artifacts", "project_id", "projects", false),
        fk("artifacts", "current_version_id", "artifact_versions"),
        fk("artifact_versions", "artifact_id", "artifacts", false),
        fk("space_file_snapshots", "parent_snapshot_id", "space_file_snapshots"),
        fk("space_file_snapshots", "project_id", "projects", false),
      ],
    );
    expect(plan.order.indexOf("projects")).toBeLessThan(plan.order.indexOf("artifacts"));
    expect(plan.order.indexOf("artifacts")).toBeLessThan(plan.order.indexOf("artifact_versions"));
    expect(plan.deferred.get("artifacts")).toEqual(["current_version_id"]);
    expect(plan.deferred.get("space_file_snapshots")).toEqual(["parent_snapshot_id"]);
  });

  it("defers a reference on the cycle, not one that only waits on it", () => {
    const plan = insertOrder(
      ["task_mentions", "agent_turns", "jobs"],
      [fk("task_mentions", "agent_turn_id", "agent_turns"), fk("agent_turns", "job_id", "jobs"), fk("jobs", "turn_id", "agent_turns")],
    );
    expect(plan.deferred.has("task_mentions")).toBe(false);
    expect(plan.order.indexOf("agent_turns")).toBeLessThan(plan.order.indexOf("task_mentions"));
  });

  it("refuses a cycle through required references", () => {
    expect(() => insertOrder(["a", "b"], [fk("a", "b_id", "b", false), fk("b", "a_id", "a", false)])).toThrow(/required columns/);
  });
});

describe("parseBundleManifest", () => {
  it("rejects another format and fills in what an older bundle lacks", () => {
    expect(() => parseBundleManifest({ format: 2 })).toThrow(/format 1/);
    const manifest = parseBundleManifest({ format: 1, sourceBucket: "b", newestActivityOffsetMs: -5, tables: [], objects: [] });
    expect(manifest.viewer).toEqual({ userId: null, watchTaskKeys: [], pins: [] });
    expect(manifest.contentTypes).toEqual({});
  });
});
