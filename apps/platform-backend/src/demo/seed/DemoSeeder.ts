import { randomBytes } from "crypto";
import { escapeIdentifier, type Pool, type PoolClient } from "pg";
import { MANIFEST_FILE, parseBundleManifest, tableFile, type BundleManifest } from "../bundle/bundleManifest";
import { DatabaseSchema, type SchemaSnapshot } from "../bundle/DatabaseSchema";
import { isPlainRecord, type Row } from "../bundle/jsonValues";
import { timestampShift } from "../bundle/timestampOffsets";
import type { BundleSource } from "./BundleSource";
import { insertOrder } from "./insertOrder";
import type { ObjectImporter } from "./ObjectImporter";
import { seedRow, type SeedRowContext } from "./seedRows";
import { TableWriter } from "./TableWriter";
import { ViewerAccount, type ViewerCredentials } from "./ViewerAccount";

export interface SeedOptions {
  force: boolean;
  now: Date;
  /** How long before `now` the bundle's newest activity lands. */
  newestAgeMs: number;
}

export interface SeedSettings {
  targetBucket: string;
  viewer: ViewerCredentials;
  hashPassword: (password: string) => Promise<string>;
  log: (line: string) => void;
}

const parseRows = (table: string, value: unknown): Row[] => {
  if (!Array.isArray(value) || !value.every(isPlainRecord)) throw new Error(`${tableFile(table)} is not a list of rows`);
  return value;
};

/** Loads a bundle into an empty, migrated database and the instance's bucket. */
export class DemoSeeder {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly source: BundleSource,
    private readonly objects: Pick<ObjectImporter, "import">,
    private readonly settings: SeedSettings,
  ) {}

  async seed(options: SeedOptions): Promise<Map<string, number>> {
    const manifest = parseBundleManifest(JSON.parse((await this.source.read(MANIFEST_FILE)).toString("utf8")));
    const client = await this.pool.connect();
    try {
      const schema = await new DatabaseSchema(client).read();
      if (!schema.columns.has("users")) throw new Error("The database has no tables; run the migrations first");
      if (!options.force && (await this.hasData(client))) throw new Error("The database already has data; pass --force to seed it anyway");

      const rows = await this.seededRows(manifest, schema, await this.rowContext(manifest, options));
      await this.objects.import(manifest.objects, manifest.contentTypes);
      await this.write(client, manifest, schema, rows);
      return new Map([...rows].map(([table, list]) => [table, list.length]));
    } finally {
      client.release();
    }
  }

  private async rowContext(manifest: BundleManifest, options: SeedOptions): Promise<SeedRowContext> {
    return {
      sourceBucket: manifest.sourceBucket,
      targetBucket: this.settings.targetBucket,
      shift: timestampShift(manifest.newestActivityOffsetMs, options.now, options.newestAgeMs),
      secrets: {
        callbackToken: () => randomBytes(32).toString("hex"),
        lockedPasswordHash: await this.settings.hashPassword(randomBytes(32).toString("hex")),
      },
    };
  }

  private async seededRows(manifest: BundleManifest, schema: SchemaSnapshot, context: SeedRowContext): Promise<Map<string, Row[]>> {
    const rows = new Map<string, Row[]>();
    for (const table of manifest.tables) {
      if (!schema.columns.has(table.name)) {
        this.settings.log(`The database has no ${table.name} table; its ${table.rows} rows are left out`);
        continue;
      }
      const raw = parseRows(table.name, JSON.parse((await this.source.read(tableFile(table.name))).toString("utf8")));
      rows.set(table.name, raw.map((row) => seedRow(table, row, context)));
    }
    return rows;
  }

  private async hasData(client: PoolClient): Promise<boolean> {
    const result = await client.query<{ found: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM projects) OR EXISTS (SELECT 1 FROM tickets) AS found",
    );
    return result.rows[0]?.found === true;
  }

  private async write(client: PoolClient, manifest: BundleManifest, schema: SchemaSnapshot, rows: Map<string, Row[]>): Promise<void> {
    const plan = insertOrder([...rows.keys()], schema.foreignKeys);
    const writer = new TableWriter(client, this.settings.log);
    await client.query("BEGIN");
    try {
      // Update triggers would stamp seeded rows with the time of the seed.
      for (const table of plan.order) await client.query(`ALTER TABLE ${escapeIdentifier(table)} DISABLE TRIGGER USER`);
      for (const table of plan.order) {
        await writer.insert(table, rows.get(table) ?? [], schema.columns.get(table) ?? [], plan.deferred.get(table) ?? []);
      }
      for (const [table, columns] of plan.deferred) {
        await writer.fillDeferred(table, rows.get(table) ?? [], schema.columns.get(table) ?? [], columns, schema.primaryKeys.get(table) ?? []);
      }
      for (const table of plan.order) await client.query(`ALTER TABLE ${escapeIdentifier(table)} ENABLE TRIGGER USER`);
      await new ViewerAccount(client, this.settings.hashPassword, this.settings.log).apply(manifest.viewer, this.settings.viewer);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}
