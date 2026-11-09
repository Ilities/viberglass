import type { BundleSource } from "../../../demo/seed/BundleSource";
import { DemoSeeder } from "../../../demo/seed/DemoSeeder";
import { TableWriter } from "../../../demo/seed/TableWriter";

interface Query {
  text: string;
  values?: unknown[];
}

const SCHEMA_COLUMNS = [
  { table_name: "users", column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { table_name: "users", column_name: "email", data_type: "character varying", is_nullable: "NO" },
  { table_name: "users", column_name: "password_hash", data_type: "character varying", is_nullable: "NO" },
  { table_name: "users", column_name: "created_at", data_type: "timestamp without time zone", is_nullable: "NO" },
  { table_name: "projects", column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { table_name: "tickets", column_name: "id", data_type: "uuid", is_nullable: "NO" },
];

function fakeClient(options: { hasData?: boolean } = {}) {
  const queries: Query[] = [];
  const client = {
    released: false,
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });
      if (text.includes("information_schema.columns")) return { rows: SCHEMA_COLUMNS };
      if (text.includes("contype = 'f'")) return { rows: [] };
      if (text.includes("contype = 'p'")) return { rows: [{ table_name: "users", column_name: "id" }] };
      if (text.includes("AS found")) return { rows: [{ found: options.hasData === true }] };
      if (text.startsWith("INSERT INTO users (email")) return { rows: [{ id: "viewer" }] };
      return { rows: [] };
    },
    release() {
      client.released = true;
    },
  };
  return { client, queries };
}

function bundle(files: Record<string, unknown>): BundleSource {
  return {
    async read(relative) {
      if (!(relative in files)) throw new Error(`missing ${relative}`);
      return Buffer.from(JSON.stringify(files[relative]));
    },
    describe: () => "test bundle",
  };
}

const manifest = {
  format: 1,
  sourceBucket: "capture",
  newestActivityOffsetMs: -1000,
  tables: [{ name: "users", rows: 1, timestampColumns: ["created_at"] }, { name: "gone_table", rows: 3, timestampColumns: [] }],
  objects: ["spaces/p1/a.md"],
  contentTypes: { "spaces/p1/a.md": "text/markdown" },
  viewer: { userId: null, watchTaskKeys: [] },
};

const settings = {
  targetBucket: "viberglass",
  viewer: { email: "Demo@Viberglass.io", password: "pw", name: "Demo visitor" },
  hashPassword: async (password: string) => `hashed:${password}`,
  log: () => {},
};

describe("DemoSeeder", () => {
  it("refuses a database that already has data unless forced", async () => {
    const { client } = fakeClient({ hasData: true });
    const objects = { import: jest.fn(async () => {}) };
    const seeder = new DemoSeeder({ connect: async () => client } as never, bundle({ "manifest.json": manifest }), objects, settings);
    await expect(seeder.seed({ force: false, now: new Date(), newestAgeMs: 0 })).rejects.toThrow(/already has data/);
    expect(objects.import).not.toHaveBeenCalled();
    expect(client.released).toBe(true);
  });

  it("uploads the objects, writes rows in one transaction with triggers off, and creates the viewer", async () => {
    const { client, queries } = fakeClient();
    const objects = { import: jest.fn(async () => {}) };
    const files = { "manifest.json": manifest, "tables/users.json": [{ id: "u1", email: "maria@acme.invalid", created_at: -1000 }] };
    const seeder = new DemoSeeder({ connect: async () => client } as never, bundle(files), objects, settings);

    const counts = await seeder.seed({ force: false, now: new Date("2026-12-24T10:00:00Z"), newestAgeMs: 3_600_000 });

    expect(counts).toEqual(new Map([["users", 1]]));
    expect(objects.import).toHaveBeenCalledWith(["spaces/p1/a.md"], { "spaces/p1/a.md": "text/markdown" });
    const texts = queries.map((query) => query.text);
    expect(texts.indexOf("BEGIN")).toBeLessThan(texts.indexOf('ALTER TABLE "users" DISABLE TRIGGER USER'));
    const insert = queries.find((query) => query.text.startsWith('INSERT INTO "users"'));
    expect(insert?.text).toContain('("id", "email", "password_hash", "created_at")');
    expect(insert?.values?.[0]).toBe("u1");
    expect(String(insert?.values?.[2])).toMatch(/^hashed:/);
    expect(insert?.values?.[3]).toBe("2026-12-24T09:00:00.000Z");
    const viewer = queries.find((query) => query.text.startsWith("INSERT INTO users (email"));
    expect(viewer?.values).toEqual(["demo@viberglass.io", "Demo visitor", "hashed:pw"]);
    expect(texts[texts.length - 1]).toBe("COMMIT");
  });
});

describe("TableWriter", () => {
  it("encodes JSON columns, leaves deferred references for later and fills them by primary key", async () => {
    const queries: Query[] = [];
    const db = { query: async (text: string, values?: unknown[]) => { queries.push({ text, values }); return { rows: [] }; } };
    const writer = new TableWriter(db as never, () => {});
    const columns = [
      { name: "id", type: "uuid", nullable: false },
      { name: "files", type: "jsonb", nullable: false },
      { name: "tags", type: "ARRAY", nullable: false },
      { name: "current_version_id", type: "uuid", nullable: true },
    ];
    const rows = [{ id: "a1", files: [{ path: "x" }], tags: ["t"], current_version_id: "v1", unknown_column: 1 }];

    await writer.insert("artifacts", rows, columns, ["current_version_id"]);
    await writer.fillDeferred("artifacts", rows, columns, ["current_version_id"], ["id"]);

    expect(queries[0].values).toEqual(["a1", '[{"path":"x"}]', ["t"], null]);
    expect(queries[1]).toEqual({ text: 'UPDATE "artifacts" SET "current_version_id" = $1 WHERE "id" = $2', values: ["v1", "a1"] });
  });
});
