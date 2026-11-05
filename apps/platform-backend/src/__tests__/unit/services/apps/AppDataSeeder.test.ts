import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AppDataSeeder } from "../../../../services/apps/AppDataSeeder";

const env = { PATH: "/usr/bin", S3_BUCKET: "viberglass", S3_ENDPOINT: "http://storage:9000", S3_ACCESS_KEY_ID: "key", S3_SECRET_ACCESS_KEY: "secret" };

function build(problem: string | null = null) {
  const store = { clearReplica: jest.fn(async () => undefined), restore: jest.fn(async () => ({ objects: 2, bytes: 100 })) };
  const seen: { config: string; database: string; args: string[] } = { config: "", database: "", args: [] };
  const run = jest.fn(async (_command: string, args: string[]) => {
    seen.args = args;
    seen.config = readFileSync(args[args.indexOf("-config") + 1], "utf8");
    seen.database = readFileSync(join(dirname(args[args.indexOf("-config") + 1]), "app.db"), "utf8");
  });
  const seeder = new AppDataSeeder(store, jest.fn(() => problem), () => env, run);
  return { seeder, store, run, seen };
}

describe("AppDataSeeder", () => {
  it("empties the replica when the app starts without data", async () => {
    const { seeder, store, run } = build();

    await seeder.seed("space-1", { from: "none" });

    expect(store.clearReplica).toHaveBeenCalledWith("space-1");
    expect(run).not.toHaveBeenCalled();
  });

  it("puts a backup's copy back as the replica", async () => {
    const { seeder, store } = build();

    await seeder.seed("space-1", { from: "last_copy", backupId: "b1" });

    expect(store.restore).toHaveBeenCalledWith("space-1", "b1");
    expect(store.clearReplica).not.toHaveBeenCalled();
  });

  it("replicates an uploaded file once into the emptied replica", async () => {
    const { seeder, store, run, seen } = build();
    const upload = join(mkdtempSync(join(tmpdir(), "seed-test-")), "upload");
    writeFileSync(upload, "SQLite format 3\0rows");

    await seeder.seed("space-1", { from: "upload", path: upload });

    expect(store.clearReplica).toHaveBeenCalledWith("space-1");
    expect(run).toHaveBeenCalledWith("litestream", expect.arrayContaining(["replicate", "-once", "-no-expand-env"]), expect.objectContaining({ AWS_ACCESS_KEY_ID: "key" }));
    expect(seen.config).toContain('path: "spaces/space-1/app-data"');
    expect(seen.database).toBe("SQLite format 3\0rows");
  });

  it("refuses a file that isn't an intact SQLite database", () => {
    const { seeder } = build("That file isn't a SQLite database.");

    expect(() => seeder.check({ from: "upload", path: "/tmp/x" })).toThrow(expect.objectContaining({ code: "DATA_FILE_INVALID" }));
    expect(() => build("bad").seeder.check({ from: "none" })).not.toThrow();
  });
});
